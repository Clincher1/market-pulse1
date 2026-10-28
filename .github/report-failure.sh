#!/usr/bin/env bash
# File an issue in Linear when a workflow step fails.
#
# Nobody can read this workflow's logs from a connector, so a red run would sit
# unnoticed until somebody went looking for it. Failing loudly into the tracker
# is better than failing quietly.
#
# A missing key must never turn a build red, so this always exits 0.

set -u

LABEL="${1:-Сбой в работе}"

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "LINEAR_API_KEY is not set in repository secrets — nothing was filed."
  exit 0
fi

TITLE="${LABEL}: ${GITHUB_SHA::7}"
DESCRIPTION="Прогон: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}
Коммит: ${GITHUB_SHA}
Ветка: ${GITHUB_REF_NAME}
Работа: ${GITHUB_WORKFLOW}"

PAYLOAD=$(jq -n \
  --arg teamId "$LINEAR_TEAM_ID" \
  --arg title "$TITLE" \
  --arg description "$DESCRIPTION" \
  '{
     query: "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
     variables: { input: { teamId: $teamId, title: $title, description: $description, priority: 1 } }
   }')

RESPONSE=$(curl -sS -X POST https://api.linear.app/graphql \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD")

echo "$RESPONSE" | head -c 500

# The point is to report, not to fail the run a second time.
exit 0
