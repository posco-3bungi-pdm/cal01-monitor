import time
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from monitor.models import Dataset, LotSummary, MeasurementFrame, EquipmentLayoutHistory, EquipmentLayout, OperationalRecord
from monitor.detection_models import DetectionRun, AnomalyCandidate
from monitor.presentation import GROUP, NONCE_KEY, TICKET_MAX_AGE, USERNAME
from monitor.workflow_models import FieldRequest, FieldRequestHistory, Notification

TEST_PASSWORD = "unit-test-only-team-password"
PUBLIC_UUID = "11111111-1111-4111-8111-111111111111"
PRIVATE_UUID = "22222222-2222-4222-8222-222222222222"


@override_settings(CAL01_PRESENTATION_ENABLED=True, CAL01_PRESENTATION_DATASET_IDS=(PUBLIC_UUID,),
                   PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class PresentationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.team = get_user_model().objects.create_user("existing-team", password=TEST_PASSWORD)
        self.team.groups.add(Group.objects.get_or_create(name="monitoring")[0])
        self.client = Client(enforce_csrf_checks=True)

    def ticket(self, client=None):
        client = client or self.client
        response = client.get("/api/presentation-login")
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        self.assertIn("private", response["Cache-Control"])
        return response.json()

    def login_payload(self, client, payload):
        token = client.get("/api/csrf").json()["csrfToken"]
        return client.post("/api/login", payload, content_type="application/json", HTTP_X_CSRFTOKEN=token)

    def enter(self, client=None):
        client = client or self.client
        response = self.login_payload(client, self.ticket(client))
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        return response.json()

    def test_ticket_issues_no_account_or_team_password_and_is_not_cacheable(self):
        payload = self.ticket()
        self.assertEqual(payload["username"], USERNAME)
        self.assertEqual(payload["expires_in"], 600)
        self.assertNotEqual(payload["password"], TEST_PASSWORD)
        self.assertFalse(get_user_model().objects.filter(username=USERNAME).exists())
        self.assertTrue(self.client.session.get(NONCE_KEY))
        token = self.client.get("/api/csrf").json()["csrfToken"]
        self.assertEqual(self.client.post("/api/presentation-login",HTTP_X_CSRFTOKEN=token).status_code, 405)

    def test_guest_login_still_requires_csrf(self):
        payload = self.ticket()
        self.assertEqual(self.client.post("/api/login", payload, content_type="application/json").status_code, 403)
        self.assertFalse(get_user_model().objects.filter(username=USERNAME).exists())

    def test_first_valid_entry_creates_only_unprivileged_unusable_password_viewer(self):
        data = self.enter()
        self.assertEqual(data["user"]["team"], "viewer")
        self.assertTrue(data["user"]["read_only"])
        self.assertFalse(data["user"]["is_admin"])
        self.assertFalse(data["user"]["can_edit_layout"])
        user = get_user_model().objects.get(username=USERNAME)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertEqual(set(user.groups.values_list("name", flat=True)), {GROUP})
        self.assertFalse(user.user_permissions.exists())
        self.assertEqual(self.client.get("/api/me").json()["user"], data["user"])

    def test_ticket_is_bound_to_its_issuing_session_and_cannot_be_replayed(self):
        other = Client(enforce_csrf_checks=True)
        own, foreign = self.ticket(), self.ticket(other)
        self.assertEqual(self.login_payload(other, own).status_code, 401)
        self.assertEqual(self.login_payload(self.client, own).status_code, 200)
        self.assertEqual(self.login_payload(other, foreign).status_code, 200)
        self.assertEqual(self.login_payload(self.client, own).status_code, 401)
        self.assertNotEqual(self.client.session.session_key, other.session.session_key)
        self.assertEqual(get_user_model().objects.filter(username=USERNAME).count(), 1)

    def test_expired_tampered_and_wrong_nonce_tickets_fail(self):
        old = time.time() - TICKET_MAX_AGE - 1
        with patch("django.core.signing.time.time", return_value=old):
            expired = self.ticket()
        self.assertEqual(self.login_payload(self.client, expired).status_code, 401)
        fresh = self.ticket()
        self.assertEqual(self.login_payload(self.client, {**fresh, "password": fresh["password"] + "x"}).status_code, 401)
        session = self.client.session
        session[NONCE_KEY] = "another-session-nonce"
        session.save()
        self.assertEqual(self.login_payload(self.client, fresh).status_code, 401)
        self.assertFalse(get_user_model().objects.filter(username=USERNAME).exists())

    @override_settings(LOGIN_FAILURE_LIMIT=2)
    def test_guest_failures_are_session_local_and_do_not_lock_team_or_other_guests(self):
        self.ticket()
        for _ in range(2):
            self.assertEqual(self.login_payload(self.client, {"username": USERNAME, "password": "invalid"}).status_code, 401)
        # Reloading the entry form must not clear the same session's failure count.
        self.ticket()
        self.assertEqual(self.login_payload(self.client, {"username": USERNAME, "password": "invalid"}).status_code, 429)
        other = Client(enforce_csrf_checks=True)
        self.enter(other)
        team = self.login_payload(self.client, {"username": self.team.username, "password": TEST_PASSWORD})
        self.assertEqual(team.status_code, 200)
        self.assertFalse(team.json()["user"]["read_only"])
        self.assertEqual(team.json()["user"]["team"], "monitoring")

    def test_existing_same_name_team_account_is_never_taken_over(self):
        existing = get_user_model().objects.create_user(USERNAME, password=TEST_PASSWORD, is_staff=True)
        existing.groups.add(Group.objects.get_or_create(name="field")[0])
        old_password = existing.password
        response = self.login_payload(self.client, self.ticket())
        self.assertEqual(response.status_code, 409)
        existing.refresh_from_db()
        self.assertEqual(existing.password, old_password)
        self.assertTrue(existing.is_staff)
        self.assertEqual(set(existing.groups.values_list("name", flat=True)), {"field"})
        self.assertEqual(self.client.get("/api/me").status_code, 401)

    def test_case_variant_account_collision_is_not_duplicated(self):
        get_user_model().objects.create_user(USERNAME.upper(), password=TEST_PASSWORD)
        self.assertEqual(self.login_payload(self.client, self.ticket()).status_code, 409)
        self.assertEqual(get_user_model().objects.filter(username__iexact=USERNAME).count(), 1)

    def test_viewer_with_added_privileges_fails_closed_without_removing_them(self):
        self.enter()
        user = get_user_model().objects.get(username=USERNAME)
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        self.assertEqual(self.login_payload(self.client, self.ticket()).status_code, 409)
        self.assertEqual(self.client.get("/api/datasets").status_code, 403)
        self.assertEqual(self.client.get("/admin/").status_code, 403)
        user.refresh_from_db()
        self.assertTrue(user.is_staff)

    def test_added_group_or_direct_or_group_permission_also_fails_closed(self):
        self.enter()
        user = get_user_model().objects.get(username=USERNAME)
        extra = Group.objects.get_or_create(name="field")[0]
        user.groups.add(extra)
        self.assertEqual(self.login_payload(self.client, self.ticket()).status_code, 409)
        user.groups.remove(extra)
        permission = Permission.objects.first()
        user.user_permissions.add(permission)
        self.assertEqual(self.login_payload(self.client, self.ticket()).status_code, 409)
        user.user_permissions.clear()
        group = Group.objects.get(name=GROUP)
        group.permissions.add(permission)
        self.assertEqual(self.login_payload(self.client, self.ticket()).status_code, 409)

    def test_disabled_entry_and_existing_viewer_session_fail_closed_but_can_logout(self):
        self.enter()
        with override_settings(CAL01_PRESENTATION_ENABLED=False):
            self.assertEqual(self.client.get("/api/presentation-login").status_code, 404)
            self.assertEqual(self.login_payload(self.client, {"username": USERNAME, "password": "anything"}).status_code, 403)
            self.assertEqual(self.client.get("/api/datasets").status_code, 403)
            token = self.client.get("/api/csrf").json()["csrfToken"]
            self.assertEqual(self.client.post("/api/logout", HTTP_X_CSRFTOKEN=token).status_code, 200)
            self.assertEqual(self.client.get("/api/me").status_code, 401)

    def source(self):
        dataset = Dataset.objects.create(id=PUBLIC_UUID,name="Demo",sha256="a"*64,source_name="demo.csv",status="ready",row_count=3)
        lot = LotSummary.objects.create(dataset=dataset,lot_no="260001",grade="SPHC",start="2026-10-26T00:00:00.000000",end="2026-10-26T00:02:00.000000",count=3)
        for n in range(3):
            stamp=f"2026-10-26T00:0{n}:00.000000"
            MeasurementFrame.objects.create(dataset=dataset,source_row=n+1,source_record_id=str(n+1),lot_no=lot.lot_no,recorded_at=stamp,recorded_at_raw=stamp,values={"TC-Z4":800+n})
        return dataset,lot

    def test_safe_measurement_workflow_and_model_reads_are_available(self):
        self.enter()
        dataset,lot=self.source()
        query={"dataset":str(dataset.id),"lot":lot.lot_no,"start":lot.start,"end":lot.end}
        for endpoint in ["datasets","channels","material-grades","equipment/layout","field-requests","field-users","notifications","detection/pending"]:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get("/api/"+endpoint).status_code,200)
        for endpoint in ["lots","series","current-frame","playback-frames","detection/runs","detection/candidates"]:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(self.client.get("/api/"+endpoint,query).status_code,200)
        with patch("monitor.model_inference.public_manifest",return_value={"models":[]}):
            self.assertEqual(self.client.get("/api/models").status_code,200)
        self.assertEqual(self.client.get("/admin/").status_code,403)

    def test_all_other_mutations_are_denied_before_data_or_workflow_changes(self):
        data=self.enter()
        token=data["csrfToken"]
        before=(Dataset.objects.count(),FieldRequest.objects.count(),FieldRequestHistory.objects.count(),DetectionRun.objects.count(),AnomalyCandidate.objects.count(),Notification.objects.count(),EquipmentLayoutHistory.objects.count())
        endpoints=[("post","datasets/import"),("patch","lot-grade-link"),("put","equipment/layout"),("post","detection/runs"),("post","detection/candidates/00000000-0000-0000-0000-000000000001/acknowledge"),("post","detection/candidates/00000000-0000-0000-0000-000000000001/resolve"),("post","field-requests"),("post","field-requests/00000000-0000-0000-0000-000000000001/transition"),("delete","field-requests")]
        with patch("monitor.data_views.register_csv") as importer:
            for method,endpoint in endpoints:
                with self.subTest(method=method,endpoint=endpoint):
                    response=getattr(self.client,method)("/api/"+endpoint,{},content_type="application/json",HTTP_X_CSRFTOKEN=token)
                    self.assertEqual(response.status_code,403)
            importer.assert_not_called()
        after=(Dataset.objects.count(),FieldRequest.objects.count(),FieldRequestHistory.objects.count(),DetectionRun.objects.count(),AnomalyCandidate.objects.count(),Notification.objects.count(),EquipmentLayoutHistory.objects.count())
        self.assertEqual(before,after)

    def test_drf_guard_also_denies_force_authenticated_viewer_without_middleware_session(self):
        self.enter()
        client=APIClient()
        client.force_authenticate(user=get_user_model().objects.get(username=USERNAME))
        from monitor.data_views import import_dataset
        request=APIRequestFactory().post("/api/datasets/import",{},format="json")
        force_authenticate(request,user=get_user_model().objects.get(username=USERNAME))
        self.assertEqual(import_dataset(request).status_code,403)
        self.assertEqual(client.post("/api/field-requests",{},format="json").status_code,403)

    def test_two_viewers_have_independent_replay_requests_and_read_only_inference(self):
        self.enter()
        other=Client(enforce_csrf_checks=True)
        self.enter(other)
        dataset,lot=self.source()
        before=(MeasurementFrame.objects.count(),FieldRequest.objects.count(),DetectionRun.objects.count(),Notification.objects.count())
        def infer(dataset,lot,watermark,model,end):
            return {"through_source_row":watermark.source_row,"predictions":[],"mode":"csv_simulation"}
        with patch("monitor.model_inference.infer_closed_minutes",side_effect=infer) as inference:
            for client,row in [(self.client,3),(other,1),(self.client,2)]:
                response=self.login_free_post(client,"/api/model-predictions",{"dataset":str(dataset.id),"lot_no":lot.lot_no,"through_source_row":row,"model":"zscore"})
                self.assertEqual(response.status_code,200)
                self.assertEqual(response.json()["through_source_row"],row)
            self.assertEqual(inference.call_count,3)
        first=self.client.get("/api/playback-frames",{"dataset":str(dataset.id),"lot":lot.lot_no,"start":lot.start,"limit":1}).json()
        later=other.get("/api/playback-frames",{"dataset":str(dataset.id),"lot":lot.lot_no,"start":"2026-10-26T00:01:00","limit":1}).json()
        self.assertNotEqual(first["frames"][0]["source_row"],later["frames"][0]["source_row"])
        self.assertEqual(before,(MeasurementFrame.objects.count(),FieldRequest.objects.count(),DetectionRun.objects.count(),Notification.objects.count()))

    def login_free_post(self,client,path,payload):
        token=client.get("/api/csrf").json()["csrfToken"]
        return client.post(path,payload,content_type="application/json",HTTP_X_CSRFTOKEN=token)


    def private_source(self):
        dataset=Dataset.objects.create(id=PRIVATE_UUID,name="PRIVATE_DATASET_TITLE",sha256="b"*64,source_name="private_temperature.csv",status="ready",row_count=3,metadata={"private_notes":"PRIVATE_METADATA","context_exports":[{"name":"PRIVATE_EXPORT"}]})
        lot=LotSummary.objects.create(dataset=dataset,lot_no="260001",grade="PRIVATE_GRADE",start="2026-10-26T00:00:00.000000",end="2026-10-26T00:02:00.000000",count=3)
        for n in range(3):
            stamp=f"2026-10-26T00:0{n}:00.000000"
            MeasurementFrame.objects.create(dataset=dataset,source_row=n+1,source_record_id="private-"+str(n+1),lot_no=lot.lot_no,recorded_at=stamp,recorded_at_raw=stamp,values={"TC-Z4":9990+n})
        return dataset,lot

    def candidate(self,dataset,lot):
        run=DetectionRun.objects.create(dataset=dataset,lot_no=lot.lot_no,config_hash="c"*64,created_by=self.team)
        return AnomalyCandidate.objects.create(run=run,channel_id="TC-Z4",zone_id="Z4",start=lot.start,end=lot.end,peak_at=lot.start,peak_value=9999 if str(dataset.id)==PRIVATE_UUID else 801,peak_z=4,point_count=2,end_reason="normal")

    def manual_request(self,dataset,lot,prefix):
        return FieldRequest.objects.create(dataset=dataset,lot_no=lot.lot_no,channel_id="TC-Z4",zone_id="Z4",start=lot.start,end=lot.end,title=prefix+"_MANUAL_TITLE",message=prefix+"_MESSAGE",requested_by=self.team)

    def test_empty_dataset_allowlist_never_opens_public_entry(self):
        with override_settings(CAL01_PRESENTATION_DATASET_IDS=()):
            self.assertEqual(self.client.get("/api/presentation-login").status_code,404)
            self.assertEqual(self.login_payload(self.client,{"username":USERNAME,"password":"anything"}).status_code,403)
        self.enter()
        with override_settings(CAL01_PRESENTATION_DATASET_IDS=()):
            self.assertEqual(self.client.get("/api/datasets").status_code,403)

    def test_public_dataset_list_and_all_measurement_routes_hide_private_source(self):
        public,lot=self.source()
        private,private_lot=self.private_source()
        self.enter()
        response=self.client.get("/api/datasets")
        self.assertEqual([d["id"] for d in response.json()["datasets"]],[PUBLIC_UUID])
        self.assertNotContains(response,"PRIVATE_")
        self.assertNotContains(response,PRIVATE_UUID)
        for endpoint in ["lots","series","current-frame","playback-frames","detection/runs","detection/candidates"]:
            with self.subTest(endpoint=endpoint):
                public_query={"dataset":PUBLIC_UUID,"lot":lot.lot_no,"start":lot.start,"end":lot.end}
                self.assertEqual(self.client.get("/api/"+endpoint,public_query).status_code,200)
                denied=self.client.get("/api/"+endpoint,{**public_query,"dataset":PRIVATE_UUID})
                self.assertEqual(denied.status_code,403)
                self.assertNotIn("PRIVATE_",denied.content.decode())
        # Even a structurally valid guessed ID cannot make private data discoverable.
        self.assertEqual(self.client.get("/api/lots",{"dataset":"33333333-3333-4333-8333-333333333333"}).status_code,403)

    def test_private_model_dataset_is_denied_before_read_only_inference(self):
        self.source()
        private,lot=self.private_source()
        self.enter()
        with patch("monitor.model_inference.infer_closed_minutes") as inference:
            denied=self.login_free_post(self.client,"/api/model-predictions",{"dataset":PRIVATE_UUID,"lot_no":lot.lot_no,"through_source_row":1,"model":"zscore"})
            self.assertEqual(denied.status_code,403)
            inference.assert_not_called()

    def test_candidate_lists_counts_and_run_id_guessing_respect_dataset_scope(self):
        public,lot=self.source()
        private,private_lot=self.private_source()
        public_candidate=self.candidate(public,lot)
        private_candidate=self.candidate(private,private_lot)
        self.enter()
        pending=self.client.get("/api/detection/pending").json()
        self.assertEqual(pending["count"],1)
        self.assertEqual([c["id"] for c in pending["candidates"]],[str(public_candidate.id)])
        self.assertNotIn(str(private_candidate.id),str(pending))
        response=self.client.get("/api/detection/candidates",{"dataset":PUBLIC_UUID,"lot":lot.lot_no,"run":str(private_candidate.run_id)})
        self.assertEqual(response.status_code,404)
        runs=self.client.get("/api/detection/runs",{"dataset":PUBLIC_UUID,"lot":lot.lot_no}).json()["runs"]
        self.assertEqual([r["id"] for r in runs],[str(public_candidate.run_id)])

    def test_request_lists_details_and_candidate_links_cannot_bypass_scope(self):
        public,lot=self.source()
        private,private_lot=self.private_source()
        public_candidate=self.candidate(public,lot)
        private_candidate=self.candidate(private,private_lot)
        public_manual=self.manual_request(public,lot,"PUBLIC")
        private_manual=self.manual_request(private,private_lot,"PRIVATE")
        public_linked=FieldRequest.objects.create(candidate=public_candidate,title="PUBLIC_CANDIDATE_TITLE",message="PUBLIC_MESSAGE",requested_by=self.team)
        private_linked=FieldRequest.objects.create(candidate=private_candidate,title="PRIVATE_CANDIDATE_TITLE",message="PRIVATE_MESSAGE",requested_by=self.team)
        self.enter()
        listing=self.client.get("/api/field-requests")
        self.assertEqual({r["id"] for r in listing.json()["requests"]},{str(public_manual.id),str(public_linked.id)})
        self.assertNotContains(listing,"PRIVATE_")
        self.assertNotContains(listing,PRIVATE_UUID)
        for request in [public_manual,public_linked]:
            self.assertEqual(self.client.get(f"/api/field-requests/{request.id}").status_code,200)
        for request in [private_manual,private_linked]:
            denied=self.client.get(f"/api/field-requests/{request.id}")
            self.assertEqual(denied.status_code,404)
            self.assertNotIn("PRIVATE_",denied.content.decode())
        candidate=self.client.get("/api/detection/candidates",{"dataset":PUBLIC_UUID,"lot":lot.lot_no}).json()["candidates"][0]
        self.assertEqual(candidate["open_request"]["id"],str(public_linked.id))

    def test_viewer_notifications_and_internal_user_directory_are_empty(self):
        public,lot=self.source()
        private,private_lot=self.private_source()
        public_candidate=self.candidate(public,lot)
        private_candidate=self.candidate(private,private_lot)
        Notification.objects.create(event_key="public-event",kind="candidate_created",title="PUBLIC_NOTIFICATION",candidate=public_candidate,recipient_team="all")
        Notification.objects.create(event_key="private-event",kind="candidate_created",title="PRIVATE_NOTIFICATION",candidate=private_candidate,recipient_team="all")
        hidden=get_user_model().objects.create_user("PRIVATE_FIELD_ACCOUNT")
        hidden.groups.add(Group.objects.get_or_create(name="field")[0])
        self.enter()
        response=self.client.get("/api/notifications",{"after":0})
        self.assertEqual(response.json(),{"notifications":[],"last_id":0,"has_more":False})
        self.assertEqual(self.client.get("/api/field-users").json(),{"users":[]})
        self.assertEqual(Notification.objects.count(),2)

    def test_real_records_are_denied_even_on_public_demo_and_team_access_is_preserved(self):
        public,lot=self.source()
        private,private_lot=self.private_source()
        private_request=self.manual_request(private,private_lot,"PRIVATE")
        for dataset,item_lot in [(public,lot),(private,private_lot)]:
            OperationalRecord.objects.create(dataset=dataset,source_record_id="op",kind="maintenance",start=item_lot.start,end=item_lot.end,precision="clock",title="PRIVATE_REAL_RECORD",equipment="plant",source="maintenance",source_id="op",payload={"id":"op","type":"maintenance","title":"PRIVATE_REAL_RECORD"},imported_from_sha256="d"*64,start_time=item_lot.start,end_time=item_lot.end)
        self.enter()
        query={"dataset":PUBLIC_UUID,"start":lot.start,"end":lot.end}
        response=self.client.get("/api/records",query)
        self.assertEqual(response.status_code,403)
        self.assertNotIn("PRIVATE_REAL_RECORD",response.content.decode())
        team=Client()
        team.force_login(self.team)
        self.assertEqual(len(team.get("/api/datasets").json()["datasets"]),2)
        self.assertEqual(team.get("/api/series",{"dataset":PRIVATE_UUID,"lot":private_lot.lot_no}).status_code,200)
        self.assertEqual(team.get(f"/api/field-requests/{private_request.id}").status_code,200)
        self.assertContains(team.get("/api/records",{**query,"dataset":PRIVATE_UUID}),"PRIVATE_REAL_RECORD")

    def test_viewer_layout_get_does_not_create_shared_records(self):
        self.enter()
        self.assertEqual(EquipmentLayout.objects.count(),0)
        self.assertEqual(self.client.get("/api/equipment/layout").status_code,200)
        self.assertEqual(EquipmentLayout.objects.count(),0)
