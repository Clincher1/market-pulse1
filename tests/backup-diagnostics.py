import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('backup_diagnostics', Path(__file__).resolve().parent.parent / 'scripts/backup_diagnostics.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Error(Exception):
    sqlstate = None


class DiagnosticsTests(unittest.TestCase):
    def test_network_classification_does_not_echo_private_connection(self):
        secret = 'postgresql://user:NEVER_PRINT_ME@private-host/database'
        for text, code in [('Network is unreachable', 'network-unreachable'),
                           ('password authentication failed', 'authentication-rejected'),
                           ('getaddrinfo failed', 'dns-failed'), ('connection timed out', 'connection-timeout')]:
            result = module.safe_failure(Error(text + ' ' + secret), 'source-connect')
            self.assertEqual(result['code'], code)
            self.assertNotIn(secret, str(result))
            self.assertNotIn('NEVER_PRINT_ME', str(result))
            self.assertNotIn('private-host', str(result))

    def test_sqlstate_is_classified_without_row_contents(self):
        for state, code in [('42501', 'permission-denied'), ('57014', 'query-timeout')]:
            error = Error('PRIVATE ROW CONTENTS')
            error.sqlstate = state
            result = module.safe_failure(error, 'snapshot')
            self.assertEqual(result['code'], code)
            self.assertNotIn('PRIVATE ROW', str(result))

    def test_unknown_text_and_phase_are_not_returned(self):
        result = module.safe_failure(Error('secret credentials and row data'), 'private arbitrary phase')
        self.assertEqual(result['phase'], 'unknown')
        self.assertEqual(result['code'], 'operation-failed')
        self.assertNotIn('secret credentials', str(result))
        self.assertNotIn('private arbitrary', str(result))


if __name__ == '__main__':
    unittest.main()
