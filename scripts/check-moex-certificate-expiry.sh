#!/usr/bin/env bash
set -euo pipefail

THRESHOLD_DAYS=30
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE="$PROJECT_ROOT/certs/moex-ca-bundle.pem"
MODE="${1:-full}"

case "$MODE" in
  full|--bundle-only) ;;
  *) echo "Usage: $0 [--bundle-only]" >&2; exit 2 ;;
esac

for command in openssl date awk timeout; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $command" >&2
    exit 2
  }
done

if [[ ! -s "$BUNDLE" ]]; then
  echo "FAIL: CA bundle is missing or empty: certs/moex-ca-bundle.pem" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
NOW_EPOCH="$(date -u +%s)"
THRESHOLD_SECONDS=$((THRESHOLD_DAYS * 24 * 60 * 60))
OVERALL_STATUS=0
ALERT_LINES=()

split_certificates() {
  local source_file="$1"
  local destination="$2"
  mkdir -p "$destination"
  awk -v dir="$destination" '
    /-----BEGIN CERTIFICATE-----/ {
      number++
      current = sprintf("%s/cert-%03d.pem", dir, number)
      inside = 1
    }
    inside { print > current }
    /-----END CERTIFICATE-----/ {
      close(current)
      inside = 0
    }
    END { if (number == 0) exit 1 }
  ' "$source_file"
}

check_certificate_file() {
  local label="$1"
  local source_file="$2"
  local cert_dir="$TMP_DIR/${label//[^a-zA-Z0-9_-]/_}"
  local count=0
  local status=0

  if ! split_certificates "$source_file" "$cert_dir"; then
    echo "FAIL: no PEM certificates found in $label" >&2
    ALERT_LINES+=("$label — сертификаты не найдены; остаток дней: неизвестен")
    return 1
  fi

  shopt -s nullglob
  for cert in "$cert_dir"/cert-*.pem; do
    count=$((count + 1))
    local subject end_date expiry_epoch remaining_seconds remaining_days
    if ! subject="$(openssl x509 -in "$cert" -noout -subject 2>/dev/null)" \
      || ! end_date="$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null)"; then
      echo "FAIL: cannot parse certificate $count in $label" >&2
      ALERT_LINES+=("$label — сертификат $count не удалось прочитать; остаток дней: неизвестен")
      status=1
      continue
    fi
    end_date="${end_date#notAfter=}"
    if ! expiry_epoch="$(date -u -d "$end_date" +%s 2>/dev/null)"; then
      echo "FAIL: cannot parse notAfter for certificate $count in $label" >&2
      ALERT_LINES+=("$label — срок сертификата $count не распознан; остаток дней: неизвестен")
      status=1
      continue
    fi
    remaining_seconds=$((expiry_epoch - NOW_EPOCH))
    remaining_days=$((remaining_seconds / 86400))

    if (( remaining_seconds <= THRESHOLD_SECONDS )); then
      printf 'FAIL: %s certificate %d expires within %d days (%d days remain): %s; notAfter=%s\n' \
        "$label" "$count" "$THRESHOLD_DAYS" "$remaining_days" "$subject" "$end_date" >&2
      ALERT_LINES+=("$label — $subject; осталось $remaining_days дней (notAfter: $end_date)")
      status=1
    else
      printf 'OK: %s certificate %d has %d days remaining: %s; notAfter=%s\n' \
        "$label" "$count" "$remaining_days" "$subject" "$end_date"
    fi
  done
  shopt -u nullglob

  if (( count == 0 )); then
    echo "FAIL: no certificates found in $label" >&2
    ALERT_LINES+=("$label — сертификаты не найдены; остаток дней: неизвестен")
    return 1
  fi
  return "$status"
}

check_certificate_file "repository CA bundle" "$BUNDLE" || OVERALL_STATUS=1

if [[ "$MODE" != "--bundle-only" ]]; then
  ISS_CHAIN="$TMP_DIR/iss-moex-chain.pem"
  ISS_DIAGNOSTIC="$TMP_DIR/iss-sclient.log"
  if timeout 30s openssl s_client \
      -connect iss.moex.com:443 \
      -servername iss.moex.com \
      -showcerts \
      </dev/null >"$ISS_CHAIN" 2>"$ISS_DIAGNOSTIC"; then
    check_certificate_file "iss.moex.com served chain" "$ISS_CHAIN" || OVERALL_STATUS=1
  else
    echo "FAIL: could not retrieve the TLS certificate chain from iss.moex.com:443" >&2
    ALERT_LINES+=("iss.moex.com served chain — цепочка недоступна; остаток дней: неизвестен")
    OVERALL_STATUS=1
  fi
fi

if [[ -n "${GITHUB_OUTPUT:-}" && ${#ALERT_LINES[@]} -gt 0 ]]; then
  delimiter="CERTIFICATE_ALERT_$(date -u +%s%N)"
  {
    printf 'alert<<%s\n' "$delimiter"
    printf '%s\n' "${ALERT_LINES[@]}"
    printf '%s\n' "$delimiter"
  } >> "$GITHUB_OUTPUT"
fi

if (( OVERALL_STATUS != 0 )); then
  echo "Certificate expiry check failed (threshold: ${THRESHOLD_DAYS} days)." >&2
  exit 1
fi

echo "Certificate expiry check passed (threshold: ${THRESHOLD_DAYS} days)."
