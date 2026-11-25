# MOEX trusted CA bundle

Certificate files were fetched directly from the official Ministry of Digital Development portal (`gu-st.ru`):

- Root CA PEM: https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
- Sub CA PEM: https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt

The root CA SHA-1 fingerprint was checked with OpenSSL and matches the published value:

`8F:F9:15:CC:AB:7B:C1:6F:8C:5C:80:99:D5:3E:0E:11:5B:3A:EC:2F`

`moex-ca-bundle.pem` concatenates the root certificate followed by the sub CA certificate. TLS certificate verification remains enabled.
