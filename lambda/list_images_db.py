import json
import os
import boto3
from boto3.dynamodb.conditions import Key

# Config
TABLE_NAME = 'InspectionImages'
BUCKET_NAME = 'inspectionappimages'
REGION = 'ap-southeast-1'

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    'Content-Type': 'application/json'
}

from urllib.parse import quote
from datetime import datetime, timedelta

# CloudFront signing config: we load signing data *only* from Secrets Manager (no env var fallback)
# Set CLOUDFRONT_SECRET_NAME to the Secrets Manager secret name/ARN containing JSON with keys:
# { "privateKey": "-----BEGIN PRIVATE KEY-----...", "keyPairId": "APKA...", "domain": "d111..cloudfront.net" }
CLOUDFRONT_SECRET_NAME = '/cloudfront/signing/inspectionapp' # actual secret name in aws secrets manager
CLOUDFRONT_EXPIRES = int(os.environ.get('CLOUDFRONT_EXPIRES', '3600'))
# Internal flags filled by load_cloudfront_secret
CLOUDFRONT_DOMAIN = None
CLOUDFRONT_KEY_PAIR_ID = None
CLOUDFRONT_PRIVATE_KEY = None


# Helper: load CloudFront secret from Secrets Manager if configured and env vars are missing
def load_cloudfront_secret():
    """Load CloudFront signing material from Secrets Manager.

    Robust parsing rules:
    - If SecretString is valid JSON, use keys from JSON
    - If SecretString contains a PEM (-----BEGIN), treat it as a raw privateKey
    - If SecretBinary exists, decode and try the same
    - Log the keys present (do NOT log private key contents)
    """
    global CLOUDFRONT_PRIVATE_KEY, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_DOMAIN
    if not CLOUDFRONT_SECRET_NAME:
        debug('list_images_db: CLOUDFRONT_SECRET_NAME not set; skipping secret load')
        return
    try:
        sm = boto3.client('secretsmanager')
        resp = sm.get_secret_value(SecretId=CLOUDFRONT_SECRET_NAME)

        secret_raw = None
        if resp.get('SecretString'):
            secret_raw = resp.get('SecretString')
        elif resp.get('SecretBinary'):
            # SecretBinary is base64-encoded bytes
            try:
                import base64
                secret_raw = base64.b64decode(resp.get('SecretBinary')).decode('utf-8')
            except Exception as e:
                debug('list_images_db: failed to decode SecretBinary: %s', e)
                secret_raw = None

        data = {}
        if secret_raw:
            # First, try JSON
            try:
                data = json.loads(secret_raw)
                debug('list_images_db: secret loaded and parsed as JSON; keys: %s', list(data.keys()))
            except Exception:
                # Not JSON — if it looks like a PEM, treat it as privateKey
                if '-----BEGIN' in secret_raw:
                    data = {'privateKey': secret_raw}
                    if '-----BEGIN RSA PRIVATE KEY-----' in secret_raw:
                        debug('list_images_db: secret appears to be a raw PKCS#1 PEM (BEGIN RSA PRIVATE KEY) and will be used as privateKey')
                    elif '-----BEGIN PRIVATE KEY-----' in secret_raw:
                        debug('list_images_db: secret appears to be a raw PKCS#8 PEM (BEGIN PRIVATE KEY); rsa library expects PKCS#1')
                    else:
                        debug('list_images_db: secret appears to be a raw PEM (treated as privateKey)')
                else:
                    # Try unescaping newline-escaped JSON (common when storing JSON with escaped newlines)
                    try:
                        unescaped = secret_raw.replace('\\n', '\n')
                        data = json.loads(unescaped)
                        debug('list_images_db: secret parsed as JSON after unescaping newlines; keys: %s', list(data.keys()))
                    except Exception as e:
                        debug('list_images_db: secret string not JSON and not PEM; giving up: %s', e)
                        data = {}
        else:
            debug('list_images_db: get_secret_value returned no SecretString/SecretBinary for %s', CLOUDFRONT_SECRET_NAME)

        # Assign values from parsed data if present
        if not CLOUDFRONT_PRIVATE_KEY and data.get('privateKey'):
            raw_pk = data.get('privateKey')
            # If the privateKey is itself JSON (double-wrapped), unwrap it
            try:
                s_strip = raw_pk.strip() if isinstance(raw_pk, str) else raw_pk
                if isinstance(s_strip, str) and s_strip.startswith('{'):
                    try:
                        inner = json.loads(s_strip)
                        debug('list_images_db: privateKey field contained JSON; inner keys: %s', list(inner.keys()))
                        if inner.get('privateKey'):
                            raw_pk = inner.get('privateKey')
                        if not CLOUDFRONT_KEY_PAIR_ID and inner.get('keyPairId'):
                            CLOUDFRONT_KEY_PAIR_ID = inner.get('keyPairId')
                        if not CLOUDFRONT_DOMAIN and inner.get('domain'):
                            CLOUDFRONT_DOMAIN = inner.get('domain')
                    except Exception as e:
                        debug('list_images_db: failed to decode JSON-wrapped privateKey: %s', e)
                        # Attempt to repair common issue: raw newlines inside JSON strings (escape them and try again)
                        try:
                            repaired = s_strip.replace('\n', '\\n').replace('\r', '')
                            inner = json.loads(repaired)
                            debug('list_images_db: repaired JSON-wrapped privateKey by escaping newlines; inner keys: %s', list(inner.keys()))
                            if inner.get('privateKey'):
                                raw_pk = inner.get('privateKey')
                            if not CLOUDFRONT_KEY_PAIR_ID and inner.get('keyPairId'):
                                CLOUDFRONT_KEY_PAIR_ID = inner.get('keyPairId')
                            if not CLOUDFRONT_DOMAIN and inner.get('domain'):
                                CLOUDFRONT_DOMAIN = inner.get('domain')
                        except Exception as e2:
                            debug('list_images_db: failed to repair JSON-wrapped privateKey: %s', e2)
                            # Fallback: try to extract PEM substring between BEGIN/END markers
                            try:
                                b = s_strip.find('-----BEGIN')
                                eidx = s_strip.find('-----END RSA PRIVATE KEY-----')
                                if b != -1 and eidx != -1:
                                    pem_candidate = s_strip[b:eidx + len('-----END RSA PRIVATE KEY-----')]
                                    raw_pk = pem_candidate
                                    debug('list_images_db: extracted PEM from JSON wrapper using substring')
                            except Exception as e3:
                                debug('list_images_db: failed to extract PEM from wrapper: %s', e3)
            except Exception:
                pass
            # If the value doesn't contain a PEM header, try base64-decode it. Also support escaped newlines.
            if '-----BEGIN' not in raw_pk:
                try:
                    import base64
                    decoded = base64.b64decode(raw_pk).decode('utf-8')
                    if '-----BEGIN' in decoded:
                        CLOUDFRONT_PRIVATE_KEY = decoded
                        debug('list_images_db: privateKey appeared base64-encoded and was decoded')
                    else:
                        unescaped = raw_pk.replace('\\n', '\n')
                        if '-----BEGIN' in unescaped:
                            CLOUDFRONT_PRIVATE_KEY = unescaped
                            debug('list_images_db: privateKey had escaped newlines and was unescaped')
                        else:
                            CLOUDFRONT_PRIVATE_KEY = raw_pk
                            debug('list_images_db: privateKey present but did not look like PEM after decoding; using raw value')
                except Exception as e:
                    # base64 decode failed — try unescaping newlines as a fallback
                    unescaped = raw_pk.replace('\\n', '\n')
                    if '-----BEGIN' in unescaped:
                        CLOUDFRONT_PRIVATE_KEY = unescaped
                        debug('list_images_db: privateKey had escaped newlines and was unescaped')
                    else:
                        CLOUDFRONT_PRIVATE_KEY = raw_pk
                        debug('list_images_db: failed to base64-decode privateKey: %s; using raw value', e)
            else:
                CLOUDFRONT_PRIVATE_KEY = raw_pk
        if not CLOUDFRONT_KEY_PAIR_ID and data.get('keyPairId'):
            CLOUDFRONT_KEY_PAIR_ID = data.get('keyPairId')
        if not CLOUDFRONT_DOMAIN and data.get('domain'):
            CLOUDFRONT_DOMAIN = data.get('domain')

        # Report which fields we have now
        present = []
        if CLOUDFRONT_KEY_PAIR_ID: present.append('keyPairId')
        if CLOUDFRONT_PRIVATE_KEY: present.append('privateKey')
        if CLOUDFRONT_DOMAIN: present.append('domain')
        # Normalize non-sensitive fields (strip whitespace and surrounding quotes) to avoid accidental %22 or trailing quotes
        try:
            if CLOUDFRONT_KEY_PAIR_ID and isinstance(CLOUDFRONT_KEY_PAIR_ID, str):
                raw_kpid = CLOUDFRONT_KEY_PAIR_ID
                CLOUDFRONT_KEY_PAIR_ID = raw_kpid.strip().strip('"').strip("'")
                if CLOUDFRONT_KEY_PAIR_ID != raw_kpid:
                    debug('list_images_db: normalized keyPairId from %s to %s', raw_kpid, CLOUDFRONT_KEY_PAIR_ID)
            if CLOUDFRONT_DOMAIN and isinstance(CLOUDFRONT_DOMAIN, str):
                raw_dom = CLOUDFRONT_DOMAIN
                CLOUDFRONT_DOMAIN = raw_dom.strip().strip('"').strip("'")
                if CLOUDFRONT_DOMAIN != raw_dom:
                    debug('list_images_db: normalized domain from %s to %s', raw_dom, CLOUDFRONT_DOMAIN)
        except Exception as e:
            debug('list_images_db: failed to normalize secret fields: %s', e)
        debug('list_images_db: secret parsed; fields present: %s', present)

    except Exception as e:
        debug('list_images_db: failed to load CloudFront secret %s: %s', CLOUDFRONT_SECRET_NAME, e)

# Logging helper and optional: import CloudFront signer utilities (depends on cryptography being available in the runtime)
# Disable verbose debug logging by default to improve cold-start perf. Set environment variable ENABLE_DEBUG=true to enable collected logs.
ENABLE_DEBUG = str(os.environ.get('ENABLE_DEBUG', '')).lower() in ('1', 'true', 'yes', 'on')
LOGS = []

def debug(msg, *args, force=False):
    """Conditional debug logger.

    - No-op unless ENABLE_DEBUG is true (or force=True is passed).
    - Avoids collecting or printing logs in the common (production) case.
    """
    if not ENABLE_DEBUG and not force:
        return
    try:
        s = msg % args if args else str(msg)
    except Exception:
        s = msg
    # Avoid logging private key contents
    if 'PRIVATE KEY' in s or 'privateKey' in s:
        s = s.split('\n')[0] + ' [private key redacted]'
    try:
        LOGS.append(s)
    except Exception:
        pass
    try:
        print(s)
    except Exception:
        pass

try:
    from botocore.signers import CloudFrontSigner
    import rsa
    HAS_RSA = True
except Exception as e:
    # Keep an intentional (non-verbose) notice if signer libs are unavailable
    debug('list_images_db: rsa/CloudFrontSigner unavailable, signed CloudFront URLs disabled: %s', e, force=True)
    HAS_RSA = False

# Attempt to load secret at cold start (secrets manager) and validate private key if possible
load_cloudfront_secret()
# Parsed RSA private key object (if available)
_CLOUDFRONT_PRIV_OBJ = None

def _parse_private_key_object(pk_value):
    """Return an rsa.PrivateKey object from a variety of inputs.

    Accepts:
    - PKCS#1 PEM text (-----BEGIN RSA PRIVATE KEY-----)
    - base64-encoded DER (raw bytes)
    - PEM with escaped newlines (\n)

    Raises ValueError with a helpful message on failure.
    """
    import base64, binascii
    if pk_value is None:
        raise ValueError('no private key provided')
    # Ensure string
    if isinstance(pk_value, bytes):
        s = pk_value.decode('utf-8', errors='replace')
    else:
        s = str(pk_value)
    s = s.strip()
    # Normalize escaped newlines and CR
    s = s.replace('\\n', '\n').replace('\r', '')
    # Remove common wrapping artifacts (repr() strings, leading/trailing quotes, b'' wrappers)
    had_wrapped = False
    if (s.startswith("b'") and s.endswith("'")) or (s.startswith('b"') and s.endswith('"')):
        s = s[2:-1]
        had_wrapped = True
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1]
        had_wrapped = True
    s = s.strip()
    # Non-sensitive normalization debug: length, begin-markers presence, and whether we removed wrappers
    has_begin = '-----BEGIN' in s
    starts_with_begin = s.lstrip().startswith('-----BEGIN')
    head_hex = s[:24].encode('utf-8', errors='replace').hex()
    debug('list_images_db: privateKey normalization: len=%d, has_BEGIN=%s, starts_with_BEGIN=%s, wrapped_removed=%s, head_hex=%s', len(s), has_begin, starts_with_begin, had_wrapped, head_hex)

    # Detect obvious PKCS#8 -> advise conversion
    if '-----BEGIN PRIVATE KEY-----' in s and '-----BEGIN RSA PRIVATE KEY-----' not in s:
        raise ValueError('PKCS#8 private key detected; convert to PKCS#1 using: openssl rsa -in pkcs8.pem -out rsa_pkcs1.pem')

    # If PKCS#1 PEM, try loading
    if '-----BEGIN RSA PRIVATE KEY-----' in s:
        try:
            return rsa.PrivateKey.load_pkcs1(s.encode('utf-8'))
        except Exception as e:
            raise ValueError(f'failed to load PKCS#1 PEM: {e}')

    # No PEM markers: try base64-decoded DER
    try:
        decoded = base64.b64decode(s)
    except (binascii.Error, TypeError) as e:
        raise ValueError('private key missing PEM markers and not base64 DER')

    # Try decoded as UTF-8 PEM inside base64
    try:
        t = decoded.decode('utf-8')
        if '-----BEGIN RSA PRIVATE KEY-----' in t:
            return rsa.PrivateKey.load_pkcs1(t.encode('utf-8'))
    except Exception:
        pass

    # Try decoded bytes as DER/PKCS#1
    try:
        return rsa.PrivateKey.load_pkcs1(decoded)
    except Exception as e:
        raise ValueError(f'base64 decoded bytes not a valid PKCS#1 key: {e}')


if HAS_RSA and CLOUDFRONT_PRIVATE_KEY:
    try:
        # Attempt to parse private key into a reusable object
        _CLOUDFRONT_PRIV_OBJ = _parse_private_key_object(CLOUDFRONT_PRIVATE_KEY)
        debug('list_images_db: CloudFront private key loaded and validated (rsa)')
    except Exception as e:
        debug('list_images_db: invalid CloudFront private key in secret: %s', e)
        CLOUDFRONT_PRIVATE_KEY = None
        CLOUDFRONT_KEY_PAIR_ID = None
        CLOUDFRONT_DOMAIN = None

# Emit a concise signing availability summary to CloudWatch
_signing_ready = bool(HAS_RSA and CLOUDFRONT_PRIVATE_KEY and CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_DOMAIN)
print(f'list_images_db: signing_ready={_signing_ready} HAS_RSA={HAS_RSA} domain_set={bool(CLOUDFRONT_DOMAIN)} keypair_set={bool(CLOUDFRONT_KEY_PAIR_ID)}')

_cf_signer = None

def _rsa_signer(message: bytes) -> bytes:
    # message is the policy or the resource string to sign
    # Use and update the module-level private key cache
    global _CLOUDFRONT_PRIV_OBJ
    # Load private key from secret and sign using SHA1 (required by CloudFront)
    if _CLOUDFRONT_PRIV_OBJ is not None:
        priv = _CLOUDFRONT_PRIV_OBJ
        debug('list_images_db: signing with pre-parsed private key object')
    else:
        # Parse on-demand (handles PEM, escaped newlines, base64 DER) and cache the result
        try:
            priv = _parse_private_key_object(CLOUDFRONT_PRIVATE_KEY)
            # cache for subsequent invocations in the same container
            _CLOUDFRONT_PRIV_OBJ = priv
            debug('list_images_db: parsed private key on-demand for signing')
        except Exception as e:
            debug('list_images_db: failed to parse private key for signing: %s', e)
            raise
    # rsa.sign returns the signature bytes using SHA-1
    try:
        signature = rsa.sign(message, priv, 'SHA-1')
        return signature
    except Exception as e:
        debug('list_images_db: rsa.sign failed: %s', e)
        raise

def get_cloudfront_signer():
    global _cf_signer
    if _cf_signer is not None:
        return _cf_signer
    # Detailed diagnostic logging when signer cannot be created
    if not HAS_RSA:
        debug('list_images_db: cannot create CloudFront signer: rsa library unavailable')
        return None
    missing = []
    if not CLOUDFRONT_KEY_PAIR_ID: missing.append('keyPairId')
    if not CLOUDFRONT_PRIVATE_KEY: missing.append('privateKey')
    if not CLOUDFRONT_DOMAIN: missing.append('domain')
    if missing:
        debug('list_images_db: cannot create CloudFront signer: missing %s', ','.join(missing))
        return None
    _cf_signer = CloudFrontSigner(CLOUDFRONT_KEY_PAIR_ID, _rsa_signer)
    debug('list_images_db: CloudFront signer created with keyPairId=%s', CLOUDFRONT_KEY_PAIR_ID)
    return _cf_signer

# DynamoDB resource

dynamodb = boto3.resource('dynamodb')

def build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body)
    }


def lambda_handler(event, context):
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return build_response(204, {})

    try:
        body = {}
        if event.get('body'):
            try:
                body = json.loads(event['body'])
            except Exception:
                body = event['body'] or {}

        # Accept either POST body or query params (GET)
        params = {}
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
        else:
            params = body

        inspection_id = params.get('inspectionId')
        room_id = params.get('roomId')
        item_id = params.get('itemId')  # optional
        signed_flag = params.get('signed')
        # default: sign URLs when retrieving unless caller explicitly requests otherwise
        def parse_bool(v):
            if v is None: return True
            if isinstance(v, bool): return v
            s = str(v).lower()
            return s in ('1','true','yes','on')
        signed = parse_bool(signed_flag)
        # Helper: parse a boolean that defaults to False (used for optional diagnostics)
        def parse_bool_false(v):
            if v is None: return False
            if isinstance(v, bool): return v
            s = str(v).lower()
            return s in ('1','true','yes','on')
        show_s3 = parse_bool_false(params.get('showS3Keys'))  # set showS3Keys=true to list S3 keys for debugging

        if not all([inspection_id, room_id]):
            return build_response(400, {'message': 'inspectionId and roomId are required'})

        # Build sortKey prefix
        if item_id:
            prefix = f"{room_id}#{item_id}"
        else:
            prefix = f"{room_id}#"

        table = dynamodb.Table(TABLE_NAME)
        response = table.query(
            KeyConditionExpression=Key('inspection_id').eq(inspection_id) & Key('room_id#item_id#image_id').begins_with(prefix),
        )

        items = response.get('Items', [])
        images = []
        signed_count = 0
        for it in items:
            sort_key = it.get('room_id#item_id#image_id')
            parts = sort_key.split('#') if sort_key else []
            item_id_value = parts[1] if len(parts) >= 2 else None
            image_id_value = parts[2] if len(parts) >= 3 else None
            s3_key = it.get('s3Key')
            norm_s3_key = None
            if s3_key:
                # Normalize by URL-unquoting first to avoid double-encoding (handles keys stored with %2B or other %-escapes)
                try:
                    from urllib.parse import unquote as url_unquote
                    orig_key = str(s3_key)
                    unquoted = url_unquote(orig_key).lstrip('/')
                    norm_s3_key = unquoted
                    safe_key = quote(norm_s3_key)
                    if orig_key.lstrip('/') != norm_s3_key:
                        debug('list_images_db: s3 key normalized: orig=%s -> norm=%s', orig_key, norm_s3_key)
                except Exception:
                    norm_s3_key = str(s3_key).lstrip('/')
                    safe_key = quote(norm_s3_key)
            else:
                safe_key = ''
            public_url = f"https://{CLOUDFRONT_DOMAIN}/{safe_key}" if s3_key and CLOUDFRONT_DOMAIN else None

            # Optionally generate a signed CloudFront URL (only when 'signed' is requested)
            cloudfront_signed = None
            try:
                if signed:
                    signer = get_cloudfront_signer()
                    if not signer:
                        debug('list_images_db: CloudFront signer not available; returning image metadata without signed URL for %s', s3_key)
                    else:
                        if public_url:
                            try:
                                expires_at = datetime.utcnow() + timedelta(seconds=CLOUDFRONT_EXPIRES)
                                cloudfront_signed = signer.generate_presigned_url(public_url, date_less_than=expires_at)
                                if cloudfront_signed:
                                    signed_count += 1
                                    try:
                                        from urllib.parse import urlparse
                                        parsed = urlparse(cloudfront_signed)
                                        preview = f"{parsed.scheme}://{parsed.netloc}{parsed.path} [query_len={len(parsed.query)}]"
                                        # Extract query parameter names for debugging (don't log values)
                                        qkeys = []
                                        if parsed.query:
                                            for pair in parsed.query.split('&'):
                                                if '=' in pair:
                                                    qkeys.append(pair.split('=')[0])
                                        debug('list_images_db: signed URL query params: %s', qkeys)
                                        if 'Key-Pair-Id' not in qkeys and 'KeyPairId' not in qkeys and 'Key-Pair-Id' not in parsed.query:
                                            debug('list_images_db: WARNING: signed URL is missing Key-Pair-Id query parameter')

                                        # Optional: perform a short server-side GET to the signed URL if debug is enabled and caller asked (checkSigned=true)
                                        try:
                                            if ENABLE_DEBUG and parse_bool(params.get('checkSigned')):
                                                from urllib.request import Request, urlopen
                                                from urllib.error import HTTPError, URLError
                                                req = Request(cloudfront_signed, headers={'User-Agent': 'list_images_db-debug/1.0'})
                                                try:
                                                    resp = urlopen(req, timeout=8)
                                                    status = getattr(resp, 'status', None) or getattr(resp, 'getcode', lambda: None)()
                                                    ctype = resp.headers.get('Content-Type') if hasattr(resp, 'headers') else None
                                                    snippet = resp.read(512)
                                                    try:
                                                        snippet_text = snippet.decode('utf-8', errors='replace')
                                                    except Exception:
                                                        snippet_text = str(snippet[:64])
                                                    debug('list_images_db: remote fetch: status=%s, content-type=%s, snippet=%s', status, ctype, snippet_text[:200])
                                                except HTTPError as he:
                                                    # Read and log error body (S3/CloudFront XML) and important request IDs (x-amz-request-id, x-amz-id-2, X-Amz-Cf-Id)
                                                    try:
                                                        body = he.read(1024)
                                                        body_text = body.decode('utf-8', errors='replace')
                                                    except Exception:
                                                        body_text = str(he)
                                                    # Extract headers from HTTPError if available
                                                    try:
                                                        hdrs = dict(getattr(he, 'headers', {}) or {})
                                                        ids = {
                                                            'x-amz-request-id': hdrs.get('x-amz-request-id') or hdrs.get('X-Amz-Request-Id') or hdrs.get('x-amz-request-id'.lower()),
                                                            'x-amz-id-2': hdrs.get('x-amz-id-2') or hdrs.get('X-Amz-Id-2') or hdrs.get('x-amz-id-2'.lower()),
                                                            'X-Amz-Cf-Id': hdrs.get('X-Amz-Cf-Id') or hdrs.get('x-amz-cf-id')
                                                        }
                                                    except Exception:
                                                        ids = {}
                                                    debug('list_images_db: remote fetch HTTPError: code=%s, reason=%s, ids=%s, body_snippet=%s', he.code, getattr(he, 'reason', ''), ids, body_text[:400])
                                                except URLError as ue:
                                                    debug('list_images_db: remote fetch URLError: %s', ue)
                                                except Exception as e2:
                                                    debug('list_images_db: remote fetch unexpected error: %s', e2)
                                            else:
                                                debug('list_images_db: skipping server-side checkSigned fetch (disabled)', force=True)
                                        except Exception as e:
                                            debug('list_images_db: remote fetch of signed URL failed: %s', e, force=True)

                                    except Exception:
                                        preview = f"signed_url_len={len(cloudfront_signed)}"
                                    debug('list_images_db: generated signed URL for %s -> %s', s3_key, preview)
                            except Exception as e:
                                debug('list_images_db: failed to sign URL for %s: %s', public_url, e)
                        else:
                            debug('list_images_db: no public URL for s3Key %s', s3_key)
                else:
                    # caller asked for unsigned metadata only
                    cloudfront_signed = None
            except Exception as e:
                debug('list_images_db: failed to generate signed CloudFront URL for %s: %s', public_url, e)

            # Always append metadata; include cloudfrontSignedUrl and publicUrl for easier debugging/testing
            images.append({
                's3Key': s3_key,
                'filename': it.get('filename'),
                'contentType': it.get('contentType'),
                'filesize': str(it.get('filesize')),
                'uploadedBy': it.get('uploadedBy'),
                'uploadedAt': it.get('uploadedAt'),
                'itemId': item_id_value,
                'imageId': image_id_value,
                'publicUrl': public_url,
                'signedUrl': cloudfront_signed,
                'cloudfrontSignedUrl': cloudfront_signed
            })

        # Optionally list S3 keys for the inspection prefix when requested (showS3Keys=true)
        s3_keys = []
        try:
            if show_s3:
                s3 = boto3.client('s3')
                # Use inspection-based prefix if available
                prefix = f"images/inspection-{inspection_id}/" if inspection_id else ''
                resp = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix, MaxKeys=200)
                s3_keys = [o.get('Key') for o in resp.get('Contents', [])] if resp.get('Contents') else []
                debug('list_images_db: S3 keys for prefix=%s: found %d', prefix, len(s3_keys))
        except Exception as e:
            debug('list_images_db: failed to list S3 keys for prefix=%s: %s', prefix if 'prefix' in locals() else '<unknown>', e)

        # Capture /opt contents for debugging (list names, type, size only; do not read file contents)
        opt_contents = []
        if ENABLE_DEBUG:
            try:
                opt_root = '/opt/python'
                if os.path.exists(opt_root) and os.path.isdir(opt_root):
                    for name in os.listdir(opt_root):
                        full = os.path.join(opt_root, name)
                        try:
                            st = os.stat(full)
                            entry = {'name': name, 'type': 'dir' if os.path.isdir(full) else 'file', 'size': st.st_size}
                        except Exception as e:
                            entry = {'name': name, 'type': 'unknown', 'error': str(e)}
                        opt_contents.append(entry)
                    debug('list_images_db: /opt contents captured: %d entries', len(opt_contents))
                else:
                    debug('list_images_db: /opt not present or not a directory')
            except Exception as e:
                debug('list_images_db: error listing /opt: %s', e)
        else:
            # Debug disabled; skip expensive /opt listing
            debug('list_images_db: skipping /opt listing (ENABLE_DEBUG not set)', force=True)

        # Report how many images had signed URLs
        debug('list_images_db: images=%d, signed=%d', len(images), signed_count)

        return build_response(200, {'images': images, 'debug': LOGS, 'optContents': opt_contents, 's3Keys': s3_keys, 'signedCount': signed_count})

    except Exception as e:
        print('Error in list_images_db:', e)
        return build_response(500, {'message': 'Internal server error', 'error': str(e), 'debug': LOGS})