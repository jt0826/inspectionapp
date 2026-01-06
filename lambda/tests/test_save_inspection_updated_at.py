import os, sys
# Ensure 'lambda' is on sys.path so tests can import package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from save_inspection import handler, metadata

# Monkeypatch boto3 resource & client in save_inspection modules
import save_inspection

class FakeTable:
    def __init__(self):
        self.updated_items = []
    def update_item(self, **kwargs):
        # Record the ExpressionAttributeValues used
        self.updated_items.append(kwargs.get('ExpressionAttributeValues'))
        return {'Attributes': kwargs.get('ExpressionAttributeValues')}

class FakeResource:
    def __init__(self):
        self.last_table = None
    def Table(self, name):
        self.last_table = FakeTable()
        return self.last_table

# Stub metadata functions to capture calls
_calls = {}

def stub_update_inspection_metadata(iid, ue, ev, debug=None):
    _calls['iid'] = iid
    _calls['ue'] = ue
    _calls['ev'] = ev
    if debug:
        debug(f"stub_update called for {iid}")
    return True

# Patch boto3 module used inside handler to use fakes
import boto3
_fake_resource = FakeResource()
boto3.resource = lambda svc=None: _fake_resource
boto3.client = lambda svc=None: None

# Ensure handler uses our stub update function directly
handler.update_inspection_metadata = stub_update_inspection_metadata

# Force deterministic timestamp
save_inspection._now_local_iso = lambda: '2026-01-07T12:00:00+08:00'
# handler imported _now_local_iso at module import time; patch there too
handler._now_local_iso = lambda: '2026-01-07T12:00:00+08:00'


def test_save_inspection_updates_updatedAt():
    payload = {'inspection': {'inspection_id': 'inspection_test', 'inspectorName': 'Tester', 'venueId': 'venue_x', 'items': [{'itemId': 'i1', 'status': 'pass'}, {'itemId': 'i2', 'status': 'pass'}]}}
    logs = []
    def dbg(m): logs.append(str(m))

    resp = handler.handle_save_inspection(payload, dbg)
    assert resp['statusCode'] == 200
    # metadata update recorded
    assert _calls['iid'] == 'inspection_test'
    assert ':u' in _calls['ev'] and _calls['ev'][':u'] == '2026-01-07T12:00:00+08:00'
    assert ':ub' in _calls['ev'] and _calls['ev'][':ub'] == 'Tester'
