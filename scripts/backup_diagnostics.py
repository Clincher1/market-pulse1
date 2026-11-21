"""Fixed-vocabulary backup diagnostics: never return exception text or a DSN."""
PHASES = {'preflight', 'source-connect', 'snapshot', 'dump', 'restore-connect',
          'restore-data', 'verify-data', 'encrypt', 'complete'}


def safe_failure(error, phase):
    phase = phase if phase in PHASES else 'unknown'
    # Inspect locally for classification only. None of this text is returned.
    text = str(error).lower()
    state = getattr(error, 'sqlstate', None)
    code = 'operation-failed'
    hint = 'No successful production backup is certified. Raw error details are withheld.'
    if phase == 'source-connect':
        if state == '28P01' or 'password authentication failed' in text:
            code = 'authentication-rejected'
            hint = 'The database rejected authentication. Check the protected connection secret; do not publish it.'
        elif 'network is unreachable' in text or 'no route to host' in text:
            code = 'network-unreachable'
            hint = 'The runner cannot reach the database network. Use the project Session pooler URI on port 5432 if the direct host requires IPv6.'
        elif 'could not translate host name' in text or 'name or service not known' in text or 'getaddrinfo' in text:
            code = 'dns-failed'
            hint = 'Database hostname resolution failed. Check the protected URI without publishing its value.'
        elif 'timeout' in text or 'timed out' in text:
            code = 'connection-timeout'
            hint = 'Database connection timed out. Check network reachability and the Session pooler connection method.'
    if state == '42501':
        code = 'permission-denied'
        hint = 'The configured database role lacks required snapshot/read permissions. Do not expand anonymous browser permissions.'
    elif state == '57014':
        code = 'query-timeout'
        hint = 'A bounded database read timed out. No successful backup is certified.'
    return {'phase': phase, 'code': code, 'message': f'Backup failed [{phase}/{code}]. {hint}'}
