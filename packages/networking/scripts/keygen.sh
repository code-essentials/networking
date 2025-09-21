mkdir -p .cert
openssl req -new -x509 -nodes \
    -out .cert/cert.pem \
    -keyout .cert/key.pem \
    -newkey ec \
    -pkeyopt ec_paramgen_curve:prime256v1 \
    -subj '/CN=127.0.0.1' \
    -days 14
