import importlib
from types import SimpleNamespace
from django.apps import apps
from django.test import TestCase, override_settings
from monitor.detection_models import CandidateResolution
from monitor.tests.test_workflow import team_user, client_for, candidate_fixture, create_payload


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class CandidateResolutionTests(TestCase):
    def setUp(self):
        self.operator = team_user('resolve-operator', 'monitoring')
        self.maintainer = team_user('resolve-maintainer', 'field')
        self.client = client_for(self.operator)
        self.field = client_for(self.maintainer)
        self.item = candidate_fixture(self.operator)
        self.url = f'/api/detection/candidates/{self.item.id}/resolve'

    def pending(self):
        return self.client.get('/api/detection/pending').data

    def test_reading_and_replay_time_do_not_clear_pending_state(self):
        self.client.post(f'/api/detection/candidates/{self.item.id}/acknowledge')
        result = self.client.get('/api/detection/pending', {'at': '2099-01-01T00:00:00'}).data
        self.assertEqual(result['count'], 1)
        self.assertTrue(result['candidates'][0]['acknowledged'])
        self.assertFalse(result['candidates'][0]['resolved'])

    def test_action_note_is_persisted_and_source_is_unchanged(self):
        response = self.client.post(self.url, {'note': '조업 기록과 비교하여 원인을 확인하고 조치를 기록함'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.pending()['count'], 0)
        self.item.refresh_from_db()
        self.assertTrue(self.item.resolved)
        self.assertEqual(self.item.resolved_by, self.operator)
        self.assertEqual(self.item.peak_value, 870.5)
        self.assertEqual(self.item.point_count, 2)
        self.assertFalse(self.item.acknowledged, 'reading and completion remain separate facts')
        self.assertEqual(CandidateResolution.objects.get().note, self.item.resolution_note)
        self.assertTrue(self.item.resolved_at)

    def test_empty_notes_outsiders_and_conflicting_retries_cannot_change_resolution(self):
        for data in [{}, {'note': ' '}, {'note': 4}, {'note': 'x' * 4001}, []]:
            self.assertEqual(self.client.post(self.url, data, format='json').status_code, 400)
        outsider = client_for(team_user('resolve-outsider'))
        self.assertEqual(outsider.post(self.url, {'note': '결과'}, format='json').status_code, 403)
        self.client.post(self.url, {'note': '실제 확인 결과'}, format='json')
        self.assertEqual(self.client.post(self.url, {'note': '실제 확인 결과'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(self.url, {'note': '다른 결과'}, format='json').status_code, 409)
        self.assertEqual(CandidateResolution.objects.count(), 1)

    def test_open_request_requires_result_confirmation_and_reinspection_preserves_history(self):
        item = self.client.post('/api/field-requests', create_payload(self.item, 'resolution-request'), format='json').data['request']
        self.assertEqual(self.client.post(self.url, {'note': '바로 종료'}, format='json').status_code, 409)
        def move(client, action, result=''):
            return client.post(f"/api/field-requests/{item['id']}/transition", {'action': action, 'revision': item['revision'], 'result': result}, format='json').data['request']
        item = move(self.field, 'accept')
        item = move(self.field, 'complete', '점검 및 조치 결과')
        self.assertEqual(self.pending()['count'], 1)
        item = move(self.client, 'close')
        self.assertEqual(self.pending()['count'], 0)
        self.assertEqual(CandidateResolution.objects.get().note, '점검 및 조치 결과')
        renewed = self.client.post('/api/field-requests', create_payload(self.item, 'resolution-recheck'), format='json')
        self.assertEqual(renewed.status_code, 201)
        self.assertEqual(self.pending()['count'], 1)
        self.assertEqual(CandidateResolution.objects.count(), 1)

    def test_migration_preserves_actual_closed_results_but_not_reopened_requests(self):
        item = self.client.post('/api/field-requests', create_payload(self.item, 'legacy-closed'), format='json').data['request']
        for actor, action, result in [(self.field, 'accept', ''), (self.field, 'complete', '기존 점검 결과'), (self.client, 'close', '')]:
            item = actor.post(f"/api/field-requests/{item['id']}/transition", {
                'action': action, 'revision': item['revision'], 'result': result,
            }, format='json').data['request']
        CandidateResolution.objects.all().delete()
        type(self.item).objects.filter(pk=self.item.pk).update(resolved=False, resolved_by=None, resolved_at=None, resolution_note='')
        backfill = importlib.import_module('monitor.migrations.0005_candidate_resolution').preserve_completed_requests
        connection = SimpleNamespace(connection=SimpleNamespace(alias='default'))
        backfill(apps, connection)
        backfill(apps, connection)
        self.item.refresh_from_db()
        self.assertTrue(self.item.resolved)
        self.assertEqual(self.item.resolution_note, '기존 점검 결과')
        self.assertEqual(self.item.resolved_by, self.operator)
        self.assertEqual(CandidateResolution.objects.count(), 1)
        self.client.post('/api/field-requests', create_payload(self.item, 'legacy-reopened'), format='json')
        backfill(apps, connection)
        self.item.refresh_from_db()
        self.assertFalse(self.item.resolved)
        self.assertEqual(CandidateResolution.objects.count(), 1)
