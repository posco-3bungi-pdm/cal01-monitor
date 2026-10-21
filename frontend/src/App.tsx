import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity, ArrowRight, Box, Check, ChevronDown, Database, Eye,
  EyeOff, FileSpreadsheet, Layers3, LoaderCircle, LogOut, Moon,
  Move3D, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, ShieldCheck, Sun,
  UserRound, X, AlertCircle, BookOpen, ChevronLeft, ChevronRight, Play, Pause, ClipboardList,
} from "lucide-react";
import { api, ApiError, queryString, refreshCsrf } from "./api";
import type { Channel, CurrentFrame, Dataset, EquipmentLayout, Lot, Placement, SeriesResponse, Theme, TimeRange, User } from "./types";
import { clockTime, dateTime, numberText, timeMs, timeIso } from "./time";
import ChannelCharts from "./components/ChannelCharts";
import RecordsPanel from "./components/RecordsPanel";
import { GUIDE_STEPS } from "./guide-data";
import DetectionPanel from "./components/DetectionPanel";
import EquipmentAlert from "./components/EquipmentAlert";
import RequestDialog from "./components/RequestDialog";
import TeamNotifications from "./components/TeamNotifications";
import FieldRequestsPanel from "./components/FieldRequestsPanel";
import WorkspaceDrawer from "./components/WorkspaceDrawer";
import type { CandidateLocation, DetectionCandidate, DetectionRun } from "./review-types";

const FurnaceScene = lazy(() => import("./components/FurnaceScene"));

type Message = { kind: "success" | "error" | "info"; text: string };
type DrawerName = "channels" | "analysis" | "requests" | null;
type Appearance = "hologram" | "realistic";
type GuideContext = {
  datasetId: string; lotNo: string; selectedChannel: string; visibleIds: string[];
  view: TimeRange | null; selection: TimeRange | null; cursor: string | null;
  section: "equipment" | "channels"; drawer: DrawerName; scrollY: number;
};
const initialTheme = (): Theme => {
  try { return localStorage.getItem("cal01-theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
};
const initialAppearance = (): Appearance => {
  try { return localStorage.getItem("cal01-appearance") === "hologram" ? "hologram" : "realistic"; } catch { return "realistic"; }
};

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-symbol"><i /><i /><i /></span><span>CAL<span className="brand-number">01</span></span>{!compact && <small>소둔로 공동 검토</small>}</div>;
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return <button className="icon-button theme-toggle" onClick={onToggle} aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "라이트 모드" : "다크 모드"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

function ErrorMessage({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return <div className="inline-error" role="alert"><AlertCircle size={16} /><span>{error instanceof Error ? error.message : "자료를 불러오지 못했습니다."}</span>{retry && <button className="text-button" onClick={retry}>다시 시도</button>}</div>;
}

function Login({ onLogin, theme, onThemeToggle, sessionError }: { onLogin: (user: User) => void; theme: Theme; onThemeToggle: () => void; sessionError?: unknown }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const reducedMotion = useReducedMotion();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || pending) return;
    setPending(true);
    setError("");
    try {
      await refreshCsrf();
      const { user } = await api<{ user: User }>("/api/login", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
      await refreshCsrf();
      setPassword("");
      onLogin(user);
    } catch (error) {
      setError(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally { setPending(false); }
  }

  return <main className="login-shell">
    <header className="login-header"><Brand /><ThemeButton theme={theme} onToggle={onThemeToggle} /></header>
    <div className="login-main">
      <motion.section className="login-story" initial={reducedMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <span className="eyebrow">연속 소둔로</span>
        <h1>설비의 흐름을 보고,<br /><em>같은 구간을<br className="mobile-break" /> 함께 확인.</em></h1>
        <p>채널값과 설비 위치를 한 화면에서.<br />모니터링팀과 현장팀이 같은 기록을 봅니다.</p>
        <div className="login-line-drawing" aria-hidden="true"><span className="schematic-baseline" /><span className="schematic-zone zone-one" /><span className="schematic-zone zone-two" /><span className="schematic-zone zone-three" /><span className="schematic-zone zone-four" /><span className="schematic-strip" /><span className="schematic-pin" /><span className="schematic-label">CAL01</span></div>
      </motion.section>
      <motion.section className="login-form-panel" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <h2>팀 계정으로 로그인</h2>
        <p>관리자가 발급한 아이디와 비밀번호를 입력해 주세요.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">아이디</label>
          <div className="input-with-icon"><UserRound size={16} /><input id="username" name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="팀 계정 아이디" required disabled={pending} autoFocus /></div>
          <label htmlFor="password">비밀번호</label>
          <div className="input-with-icon"><ShieldCheck size={16} /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="비밀번호" required disabled={pending} /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          {sessionError && !(sessionError instanceof ApiError && sessionError.status === 401) ? <ErrorMessage error={sessionError} /> : null}
          <button className="primary-button login-submit" disabled={pending || !username.trim() || !password} type="submit">{pending ? <><LoaderCircle className="spin" size={17} />로그인 중</> : <>작업 화면으로<ArrowRight size={18} /></>}</button>
        </form>
        <div className="login-role-note"><span>모니터링팀 <strong>설비 관제</strong></span><span>현장 작업팀 <strong>채널 확인</strong></span></div>
        <p className="login-help">접속이 안 된다면 팀 관리자에게 계정을 확인해 주세요.</p>
      </motion.section>
    </div>
    <footer className="login-footer"><span>CAL01 · 소둔로 공동 검토</span><span>데이터는 서버에, 판단은 함께.</span></footer>
  </main>;
}

function Workspace({ user, onLogout, theme, onThemeToggle }: { user: User; onLogout: () => void; theme: Theme; onThemeToggle: () => void }) {
  const queryClient = useQueryClient();
  const fieldTeam = /field|현장/i.test(user.team);
  const [section, setSection] = useState<"equipment" | "channels">("equipment");
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [datasetId, setDatasetId] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("TC-Z3");
  const [visibleIds, setVisibleIds] = useState<string[]>(["TC-Z3", "OP-Z3", "CP-Z4"]);
  const [view, setView] = useState<TimeRange | null>(null);
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showInterior, setShowInterior] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [editing, setEditing] = useState(false);
  const [draftPlacements, setDraftPlacements] = useState<Placement[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [layoutConflict, setLayoutConflict] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const [motionPlaying, setMotionPlaying] = useState(false);
  const [runChoice, setRunChoice] = useState<{ context: string; id: string } | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [bannerCandidateId, setBannerCandidateId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<DetectionCandidate | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [requestCandidate, setRequestCandidate] = useState<DetectionCandidate | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestFocusRevision, setRequestFocusRevision] = useState(0);
  const guideContext = useRef<GuideContext | null>(null);
  const chartTarget = useRef<HTMLDivElement>(null);
  const firstLotKey = useRef("");
  const savedRevision = useRef(0);
  const reducedMotion = useReducedMotion();
  const guideStep = guideIndex === null ? null : GUIDE_STEPS[guideIndex];

  const datasetsQuery = useQuery({
    queryKey: ["datasets", user.username], queryFn: ({ signal }) => api<{ datasets: Dataset[] }>("/api/datasets", { signal }),
  });
  const channelsQuery = useQuery({
    queryKey: ["channels"], queryFn: ({ signal }) => api<{ channels: Channel[] }>("/api/channels", { signal }),
    staleTime: 300_000,
  });
  const lotsQuery = useQuery({
    queryKey: ["lots", datasetId], enabled: !!datasetId,
    queryFn: ({ signal }) => api<{ lots: Lot[] }>(`/api/lots?${queryString({ dataset: datasetId })}`, { signal }),
  });
  const layoutQuery = useQuery({
    queryKey: ["layout"], queryFn: ({ signal }) => api<EquipmentLayout>("/api/equipment/layout", { signal }),
  });
  const datasets = datasetsQuery.data?.datasets ?? [];
  const channels = channelsQuery.data?.channels ?? [];
  const lots = lotsQuery.data?.lots ?? [];
  const dataset = datasets.find(item => item.id === datasetId);
  const lot = lots.find(item => String(item.lot_no) === lotNo);
  const channel = channels.find(item => item.id === selectedChannel);
  const displayedChannels = useMemo(() => channels.filter(item => visibleIds.includes(item.id)), [channels, visibleIds]);
  const analysisContext = `${datasetId}:${lotNo}`;
  const runsQuery = useQuery({
    queryKey: ["detection-runs", datasetId, lotNo], enabled: !!datasetId && !!lotNo,
    queryFn: ({ signal }) => api<{ runs: DetectionRun[] }>(`/api/detection/runs?${queryString({ dataset: datasetId, lot: lotNo })}`, { signal }),
    refetchInterval: 5000,
  });
  const runs = runsQuery.data?.runs ?? [];
  const chosenRunId = runChoice?.context === analysisContext && runs.some(run => run.id === runChoice.id) ? runChoice.id : runs[0]?.id;
  const chosenRun = runs.find(run => run.id === chosenRunId);
  const candidatesQuery = useQuery({
    queryKey: ["detection-candidates", datasetId, lotNo, chosenRunId], enabled: !!chosenRunId,
    queryFn: ({ signal }) => api<{ candidates: DetectionCandidate[] }>(`/api/detection/candidates?${queryString({ dataset: datasetId, lot: lotNo, run: chosenRunId })}`, { signal }),
    refetchInterval: 5000,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];
  const focusedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId);
  const alertCandidate = candidates.find(candidate => candidate.id === bannerCandidateId)
    ?? focusedCandidate ?? candidates.find(candidate => !candidate.acknowledged) ?? candidates[0];
  const alertChannelIds = useMemo(() => [...new Set(candidates.map(candidate => candidate.channel_id))], [candidates]);
  const alertZoneIds = useMemo(() => [...new Set(candidates.map(candidate => candidate.zone_id))], [candidates]);
  const frameQuery = useQuery({
    queryKey: ["frame", datasetId, lotNo, cursor], enabled: !!datasetId && !!lot && !!cursor,
    queryFn: ({ signal }) => api<CurrentFrame>(`/api/current-frame?${queryString({ dataset: datasetId, lot: lotNo, at: cursor ?? undefined })}`, { signal }),
  });
  const seriesQuery = useQuery({
    queryKey: ["series", datasetId, lotNo, visibleIds.join(","), view?.start, view?.end],
    enabled: !!datasetId && !!lot && !!view && visibleIds.length > 0,
    queryFn: ({ signal }) => api<SeriesResponse>(`/api/series?${queryString({ dataset: datasetId, lot: lotNo, channels: visibleIds.join(","), start: view?.start, end: view?.end, max_points: 1000 })}`, { signal }),
  });
  const frameValues = useMemo(() => Object.fromEntries((frameQuery.data?.channels ?? []).map(item => [item.channel_id, item.value])), [frameQuery.data]);
  const frameValue = frameQuery.data?.channels.find(item => item.channel_id === selectedChannel);
  const frameTime = frameQuery.data?.anchor_time ?? cursor;
  const placements = draftPlacements ?? layoutQuery.data?.placements ?? [];
  const dirty = editing && draftPlacements !== null && JSON.stringify(draftPlacements) !== JSON.stringify(layoutQuery.data?.placements);

  useEffect(() => {
    if (datasets.length && !datasets.some(item => item.id === datasetId)) setDatasetId(datasets[0].id);
  }, [datasets, datasetId]);
  useEffect(() => {
    if (lots.length && !lots.some(item => String(item.lot_no) === lotNo)) setLotNo(String(lots[0].lot_no));
  }, [lots, lotNo]);
  useEffect(() => {
    if (!lot) return;
    const key = `${datasetId}:${lot.lot_no}`;
    if (firstLotKey.current !== key) {
      firstLotKey.current = key;
      setView({ start: lot.start, end: lot.end });
      setCursor(lot.start);
      setSelection(null);
      setSelectedCandidateId(null);
      setBannerCandidateId(null);
      setAnalysisError(null);
    }
  }, [datasetId, lot]);
  useEffect(() => {
    if (pendingFocus && lot && datasetId === pendingFocus.dataset_id && String(lot.lot_no) === String(pendingFocus.lot_no)) {
      focusCandidate(pendingFocus);
      setPendingFocus(null);
    }
  }, [pendingFocus, lot, datasetId]);
  useEffect(() => { if (reducedMotion) setMotionPlaying(false); }, [reducedMotion]);
  useEffect(() => {
    try { localStorage.setItem("cal01-appearance", appearance); } catch { /* Display preference is optional. */ }
  }, [appearance]);
  useEffect(() => {
    if (channels.length && !channels.some(item => item.id === selectedChannel)) setSelectedChannel(channels[0].id);
  }, [channels, selectedChannel]);
  useEffect(() => {
    if (message?.kind !== "success") return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (guideIndex !== null) closeGuide();
      else if (sidebarOpen) setSidebarOpen(false);
      else setDrawer(null);
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [guideIndex, sidebarOpen]);

  function selectChannel(id: string) {
    setSelectedChannel(id);
    setVisibleIds(previous => previous.includes(id) ? previous : [...previous, id]);
  }

  function focusCandidate(candidate: DetectionCandidate, scroll = true) {
    if (guideIndex !== null) { setMessage({ kind: "info", text: "가이드를 종료한 뒤 실제 분석 후보를 열어 주세요." }); return; }
    if (editing) { setMessage({ kind: "info", text: "표시점 편집을 저장하거나 취소한 뒤 후보를 열어 주세요." }); return; }
    if (!lot || candidate.dataset_id !== datasetId || String(candidate.lot_no) !== lotNo) {
      setRunChoice({ context: `${candidate.dataset_id}:${candidate.lot_no}`, id: candidate.run_id });
      setPendingFocus(candidate);
      setDatasetId(candidate.dataset_id);
      setLotNo(String(candidate.lot_no));
      return;
    }
    setRunChoice({ context: `${candidate.dataset_id}:${candidate.lot_no}`, id: candidate.run_id });
    setSelectedCandidateId(candidate.id);
    setBannerCandidateId(candidate.id);
    selectChannel(candidate.channel_id);
    const from = timeMs(candidate.start), to = timeMs(candidate.end);
    const padding = Math.max(30_000, (to - from) * 0.3);
    setView({ start: timeIso(Math.max(timeMs(lot.start), from - padding)), end: timeIso(Math.min(timeMs(lot.end), to + padding)) });
    setCursor(candidate.peak_at);
    if (scroll) goToSection("channels");
  }

  function selectSceneChannel(id: string) {
    if (!editing && guideIndex === null) {
      const candidate = candidates.find(item => item.channel_id === id && item.id === selectedCandidateId)
        ?? candidates.find(item => item.channel_id === id && !item.acknowledged)
        ?? candidates.find(item => item.channel_id === id);
      if (candidate) { focusCandidate(candidate); return; }
    }
    selectChannel(id);
  }

  async function openCandidateLocation(location: CandidateLocation) {
    if (analysisRunning) { setMessage({ kind: "info", text: "진행 중인 LOT 분석이 끝난 뒤 다른 후보를 열어 주세요." }); return; }
    if (guideIndex !== null) { setMessage({ kind: "info", text: "가이드를 종료한 뒤 알림의 후보를 열어 주세요." }); return; }
    try {
      const result = await api<{ candidates: DetectionCandidate[] }>(`/api/detection/candidates?${queryString({ dataset: location.dataset_id, lot: location.lot_no, run: location.run_id })}`);
      const candidate = result.candidates.find(item => item.id === location.candidate_id);
      if (!candidate) throw new Error("알림에 연결된 후보를 찾지 못했습니다.");
      focusCandidate(candidate);
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "후보를 열지 못했습니다." }); }
  }

  async function runAnalysis() {
    if (!lot || analysisRunning || visibleIds.length === 0 || editing || guideIndex !== null) return;
    const context = analysisContext;
    const sourceDataset = datasetId;
    const sourceLot = lotNo;
    setAnalysisRunning(true); setAnalysisError(null);
    try {
      const result = await api<{ run: DetectionRun; candidates: DetectionCandidate[]; reused: boolean }>("/api/detection/runs", { method: "POST", body: JSON.stringify({
        dataset_id: sourceDataset, lot_no: sourceLot, channels: displayedChannels.map(item => item.id),
        threshold: 3, ddof: 0, max_gap_seconds: 60, min_valid_samples: 30,
      }) });
      queryClient.setQueryData<{ runs: DetectionRun[] }>(["detection-runs", sourceDataset, sourceLot], previous => ({
        runs: [result.run, ...(previous?.runs ?? []).filter(item => item.id !== result.run.id)],
      }));
      queryClient.setQueryData(["detection-candidates", sourceDataset, sourceLot, result.run.id], { candidates: result.candidates });
      setRunChoice({ context, id: result.run.id });
      if (result.candidates[0]) focusCandidate(result.candidates[0], false);
      setMessage({ kind: "success", text: result.reused ? "같은 조건으로 저장된 분석을 불러왔습니다." : `과거 LOT 분석을 저장했습니다. 통계적 후보 ${result.candidates.length}개를 찾았습니다.` });
    } catch (error) { setAnalysisError(error); }
    finally { setAnalysisRunning(false); }
  }

  async function acknowledgeCandidate(candidate: DetectionCandidate) {
    if (acknowledging) return;
    setBannerCandidateId(candidate.id); setAcknowledging(candidate.id);
    try {
      await api(`/api/detection/candidates/${encodeURIComponent(candidate.id)}/acknowledge`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["detection-candidates"] });
      setMessage({ kind: "success", text: "후보를 확인했습니다. 움직이는 강조만 멈추며 고장이나 해결 여부를 확정하지 않습니다." });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "확인 상태를 저장하지 못했습니다." }); }
    finally { setAcknowledging(null); }
  }

  function openRequests(requestId?: string) {
    setSelectedRequestId(requestId ?? null);
    setRequestFocusRevision(value => value + 1);
    setDrawer("requests");
    setSidebarOpen(false);
  }

  function startGuide() {
    if (guideIndex !== null || editing) return;
    guideContext.current = {
      datasetId, lotNo, selectedChannel, visibleIds: [...visibleIds], view, selection, cursor,
      section, drawer, scrollY: window.scrollY,
    };
    setGuideIndex(0);
    setDrawer(null);
    setSection("equipment");
    if (GUIDE_STEPS[0]?.channel) selectChannel(GUIDE_STEPS[0].channel);
    if (window.innerWidth <= 760) setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  }

  function moveGuide(index: number) {
    const step = GUIDE_STEPS[index];
    if (!step) return;
    setGuideIndex(index);
    if (step.channel) selectChannel(step.channel);
  }

  function closeGuide() {
    const previous = guideContext.current;
    setGuideIndex(null);
    guideContext.current = null;
    if (!previous) return;
    firstLotKey.current = `${previous.datasetId}:${previous.lotNo}`;
    setDatasetId(previous.datasetId);
    setLotNo(previous.lotNo);
    setSelectedChannel(previous.selectedChannel);
    setVisibleIds(previous.visibleIds);
    setView(previous.view);
    setSelection(previous.selection);
    setCursor(previous.cursor);
    setSection(previous.section);
    setDrawer(previous.drawer);
    window.setTimeout(() => window.scrollTo({ top: previous.scrollY, behavior: "instant" }), 100);
  }

  function setChannelGroup(group: "all" | "TC" | "OP" | "selected") {
    setVisibleIds(channels.filter(item => group === "all" || (group === "selected" ? item.id === selectedChannel : item.id.startsWith(`${group}-`))).map(item => item.id));
  }

  function beginEditing() {
    if (!layoutQuery.data || !user.can_edit_layout) return;
    savedRevision.current = layoutQuery.data.revision;
    setDraftPlacements(structuredClone(layoutQuery.data.placements));
    setEditing(true);
    setDrawer(null);
    setMotionPlaying(false);
    setLayoutConflict(false);
    setMessage({ kind: "info", text: "3D의 표시점을 선택한 뒤 위치를 옮겨 주세요. 저장 전에는 다른 팀원에게 반영되지 않습니다." });
  }

  function changePlacement(id: string, position: [number, number, number]) {
    setDraftPlacements(previous => {
      if (!previous) return previous;
      const exists = previous.some(item => item.channel_id === id);
      return exists ? previous.map(item => item.channel_id === id ? { ...item, position } : item) :
        [...previous, { channel_id: id, zone_id: channels.find(item => item.id === id)?.zone ?? "", position }];
    });
  }

  function cancelEditing() {
    setEditing(false);
    setDraftPlacements(null);
    setLayoutConflict(false);
    setMessage(null);
  }

  async function saveLayout() {
    if (!draftPlacements || !layoutQuery.data || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api<EquipmentLayout>("/api/equipment/layout", { method: "PUT", body: JSON.stringify({
        model_version: layoutQuery.data.model_version,
        revision: savedRevision.current,
        placements: draftPlacements,
      }) });
      queryClient.setQueryData(["layout"], saved);
      setEditing(false);
      setDraftPlacements(null);
      setMessage({ kind: "success", text: "채널 표시점 위치를 저장했습니다." });
      setLayoutConflict(false);
    } catch (error) {
      setLayoutConflict(error instanceof ApiError && error.status === 409);
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "위치를 저장하지 못했습니다." });
    } finally { setSaving(false); }
  }

  async function loadLatestLayout() {
    const result = await layoutQuery.refetch();
    if (result.data) {
      savedRevision.current = result.data.revision;
      setDraftPlacements(structuredClone(result.data.placements));
      setLayoutConflict(false);
      setMessage({ kind: "info", text: "최신 위치를 불러왔습니다. 필요한 표시점만 다시 옮겨 주세요." });
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {
      await api("/api/logout", { method: "POST" });
      queryClient.clear();
      onLogout();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "로그아웃하지 못했습니다." }); }
    finally { setLogoutPending(false); }
  }

  function goToSection(next: "equipment" | "channels") {
    setSection(next);
    setDrawer(next === "channels" ? "channels" : null);
    setSidebarOpen(false);
  }

  const fatalAuth = [datasetsQuery.error, channelsQuery.error, lotsQuery.error, frameQuery.error, seriesQuery.error].some(error => error instanceof ApiError && error.status === 401);
  if (fatalAuth) return <div className="session-expired"><ShieldCheck size={36} /><h1>다시 로그인해 주세요.</h1><p>로그인이 만료됐습니다. 저장된 자료는 서버에 남아 있습니다.</p><button className="primary-button" onClick={() => { queryClient.clear(); onLogout(); }}>로그인 화면으로<ArrowRight size={16} /></button></div>;

  return <div className={`workspace immersive ${sidebarOpen ? "" : "sidebar-collapsed"} ${drawer ? "has-drawer" : ""} ${alertCandidate && guideIndex === null ? "has-candidate" : ""}`}>
    <aside className="sidebar" aria-label="작업 메뉴" hidden={!sidebarOpen} onKeyDown={event => { if (event.key === "Escape") setSidebarOpen(false); }}>
      <div className="sidebar-brand"><Brand compact /><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="메뉴 접기"><PanelLeftClose size={17} /></button></div>
      <div className="sidebar-section-label">작업 화면</div>
      <nav className="main-navigation">
        <button className={section === "equipment" ? "active" : ""} onClick={() => goToSection("equipment")}><Box size={18} /><span>설비 관제</span><ArrowRight size={14} /></button>
        <button className={section === "channels" ? "active" : ""} onClick={() => goToSection("channels")}><Activity size={18} /><span>채널 확인</span><ArrowRight size={14} /></button>
        <button onClick={() => { if (window.innerWidth <= 760) setSidebarOpen(false); openRequests(); }}><ClipboardList size={18} /><span>팀 확인 요청</span><ArrowRight size={14} /></button>
      </nav>
      <div className="sidebar-source">
        <div className="sidebar-section-label">불러온 자료</div>
        <label htmlFor="dataset-select">현재 데이터</label>
        <div className="select-wrap"><select id="dataset-select" value={datasetId} onChange={event => { setDatasetId(event.target.value); setLotNo(""); setView(null); setCursor(null); firstLotKey.current = ""; }} disabled={datasetsQuery.isPending || !datasets.length || analysisRunning}>
          {!datasets.length && <option>{datasetsQuery.isPending ? "불러오는 중…" : "등록된 자료 없음"}</option>}
          {datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select><ChevronDown size={14} /></div>
        {dataset && <div className="source-meta"><span><FileSpreadsheet size={13} />{dataset.row_count.toLocaleString()}행</span><span>{lots.length ? `${lots.length} LOT` : dataset.status}</span></div>}
        <ErrorMessage error={datasetsQuery.error} retry={() => void datasetsQuery.refetch()} />
        <label htmlFor="lot-select">확인할 LOT</label>
        <div className="select-wrap"><select id="lot-select" value={lotNo} onChange={event => setLotNo(event.target.value)} disabled={lotsQuery.isPending || !lots.length || analysisRunning}>
          {!lots.length && <option>{lotsQuery.isFetching ? "불러오는 중…" : "LOT 없음"}</option>}
          {lots.map(item => <option key={item.lot_no} value={String(item.lot_no)}>{item.lot_no} · {item.grade || "강종 미기록"}</option>)}
        </select><ChevronDown size={14} /></div>
        {lot && <div className="lot-observation"><span>이 LOT의 기록</span><strong>{dateTime(lot.start)}</strong><strong>{dateTime(lot.end)}</strong><small>{lot.count.toLocaleString()}행</small></div>}
      </div>
      <div className="sidebar-bottom">
        <div className="team-identity"><div className="avatar">{user.display_name.slice(0, 1)}</div><div><strong>{user.display_name}</strong><span>{fieldTeam ? "현장 작업팀" : "모니터링팀"}{user.is_admin ? " · 관리자" : ""}</span></div></div>
        <button className="logout-button" onClick={logout} disabled={logoutPending || editing}><LogOut size={15} />{logoutPending ? "로그아웃 중…" : "로그아웃"}</button>
      </div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <div className="breadcrumb"><button className="icon-button" onClick={() => setSidebarOpen(value => !value)} aria-label={sidebarOpen ? "메뉴 접기" : "메뉴 펼치기"}><PanelLeftOpen size={20} /></button><Brand compact /><span className="mode-badge">과거 자료</span></div>
        <nav className="immersive-navigation" aria-label="설비 위에서 열기">
          <button aria-label="설비 전체 화면" className={drawer === null ? "active" : ""} onClick={() => goToSection("equipment")}><Box size={15} /><span>설비</span></button>
          <button aria-label="채널 그래프 열기" className={drawer === "channels" ? "active" : ""} onClick={() => goToSection("channels")}><Activity size={15} /><span>그래프</span></button>
          <button aria-label="과거 LOT 이상 후보 열기" className={drawer === "analysis" ? "active" : ""} onClick={() => setDrawer(drawer === "analysis" ? null : "analysis")}><AlertCircle size={15} /><span>이상 후보</span>{candidates.length > 0 && <small>{candidates.length}</small>}</button>
          <button aria-label="팀 확인 요청함 열기" className={drawer === "requests" ? "active" : ""} onClick={() => openRequests()}><ClipboardList size={15} /><span>요청함</span></button>
        </nav>
        <div className="topbar-right"><TeamNotifications username={user.username} onOpenCandidate={location => void openCandidateLocation(location)} onOpenRequests={openRequests} /><button aria-label={guideStep ? "가이드 종료" : "가이드 모드"} className={`subtle-button guide-toggle ${guideStep ? "is-active" : ""}`} onClick={guideStep ? closeGuide : startGuide} disabled={editing || analysisRunning} aria-pressed={guideStep !== null}><BookOpen size={14} /><span>{guideStep ? "가이드 종료" : "가이드"}</span></button><ThemeButton theme={theme} onToggle={onThemeToggle} /></div>
      </header>
      <main className="main-content">
        <section className="scene-data-control" aria-label="현재 보고 있는 자료">
          <label htmlFor="scene-lot-select">LOT</label><select id="scene-lot-select" value={lotNo} onChange={event => setLotNo(event.target.value)} disabled={!lots.length || analysisRunning || editing || !!guideStep}>
            {!lots.length && <option>자료 불러오는 중</option>}{lots.map(item => <option key={item.lot_no} value={String(item.lot_no)}>{item.lot_no} · {item.grade || "강종 미기록"}</option>)}
          </select>
          <div className="scene-recorded-time"><span>선택 시각</span><strong>{cursor ? dateTime(cursor, true) : "불러오는 중"}</strong></div>
        </section>
        {guideStep && guideIndex !== null && <section className="guide-panel" aria-label="공정과 채널 읽기 가이드" aria-live="polite">
          <div className="guide-panel-top"><span><BookOpen size={16} />공정 읽기</span><span>{guideIndex + 1} / {GUIDE_STEPS.length}</span><button className="icon-button" onClick={closeGuide} aria-label="가이드 닫고 이전 화면으로 돌아가기"><X size={18} /></button></div>
          <div className="guide-content"><div className="guide-steps" aria-label="가이드 단계">{GUIDE_STEPS.map((step, index) => <button key={step.id} className={index === guideIndex ? "active" : ""} onClick={() => moveGuide(index)} aria-current={index === guideIndex ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{step.title}</button>)}</div>
            <div className="guide-explanation"><span className="guide-kind">{guideStep.kind === "practice" ? "설명용 연습 · 실제 경고가 아닙니다" : guideStep.kind === "reading" ? "기록 읽는 방법" : "설비 공정 이해"}</span><h2>{guideStep.title}</h2><p>{guideStep.body}</p><div className="guide-check"><Check size={15} /><span>{guideStep.check}</span></div><p className="guide-preservation">설명에 맞춰 채널만 선택합니다. 종료하면 가이드 시작 전에 보던 LOT와 시각으로 돌아갑니다.</p></div>
          </div>
          <div className="guide-footer"><button className="subtle-button" disabled={guideIndex === 0} onClick={() => moveGuide(guideIndex - 1)}><ChevronLeft size={15} />이전</button><span>교육 진행 내용은 저장하지 않습니다.</span>{guideIndex < GUIDE_STEPS.length - 1 ? <button className="primary-button compact" onClick={() => moveGuide(guideIndex + 1)}>다음<ChevronRight size={15} /></button> : <button className="primary-button compact" onClick={closeGuide}>마치고 돌아가기<Check size={15} /></button>}</div>
        </section>}
        <AnimatePresence>{message && <motion.div initial={reducedMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`notice ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.kind === "success" ? <Check size={17} /> : <AlertCircle size={17} />}<span>{message.text}</span>{layoutConflict && <button className="text-button" onClick={() => void loadLatestLayout()}>최신 위치 불러오기</button>}<button className="icon-button" onClick={() => setMessage(null)} aria-label="안내 닫기"><X size={15} /></button>
        </motion.div>}</AnimatePresence>
        <ErrorMessage error={lotsQuery.error} retry={() => void lotsQuery.refetch()} />
        <ErrorMessage error={channelsQuery.error} retry={() => void channelsQuery.refetch()} />
        {!datasetsQuery.isPending && datasets.length === 0 && !datasetsQuery.error && <div className="panel no-data-panel"><Database size={30} /><h2>등록된 데이터가 없습니다.</h2><p>서버에 CSV를 등록하면 LOT와 채널값을 여기에서 확인할 수 있습니다.</p><button className="subtle-button" onClick={() => void datasetsQuery.refetch()}><RefreshCw size={14} />등록 상태 다시 확인</button></div>}
        {alertCandidate && guideIndex === null && <EquipmentAlert alert={{
          id: alertCandidate.id, equipment: "CAL01", zone: alertCandidate.zone_id, channel: alertCandidate.channel_id,
          value: alertCandidate.peak_value, unit: channels.find(item => item.id === alertCandidate.channel_id)?.unit ?? "단위 미확인",
          time: alertCandidate.peak_at, reason: `과거 LOT ${lotNo} · |Z| > 3으로 찾은 후보`, severity: "candidate", acknowledged: alertCandidate.acknowledged,
        }} pending={acknowledging === alertCandidate.id} onAcknowledge={() => void acknowledgeCandidate(alertCandidate)} onFocus={() => focusCandidate(alertCandidate)} />}
        <section className="panel equipment-panel" aria-labelledby="equipment-heading">
          <div className="panel-heading scene-toolbar">
            <h2 id="equipment-heading" className="visually-hidden">연속 소둔로 CAL01</h2>
            <div className="segmented-control appearance-control" role="group" aria-label="설비 표현 방식">
              <button aria-pressed={appearance === "hologram"} onClick={() => setAppearance("hologram")}>홀로그램</button>
              <button aria-pressed={appearance === "realistic"} onClick={() => setAppearance("realistic")}>실제 설비</button>
            </div>
            <details className="scene-tools">
              <summary>도구 <ChevronDown size={16} /></summary>
              <div className="scene-tools-menu">
                <button className={`subtle-button ${motionPlaying ? "is-active" : ""}`} aria-pressed={motionPlaying} disabled={!!reducedMotion || editing} onClick={() => setMotionPlaying(value => !value)}>{motionPlaying ? <Pause size={16} /> : <Play size={16} />}{motionPlaying ? "강판 이동 멈춤" : "강판 이동 재생"}</button>
                {reducedMotion && <p>기기의 동작 줄이기 설정에 따라 재생을 껐습니다.</p>}
                <button className={`subtle-button ${showInterior ? "is-active" : ""}`} aria-pressed={showInterior} onClick={() => setShowInterior(value => !value)}><Layers3 size={16} />{showInterior ? "외함 보기" : "내부 보기"}</button>
                {user.can_edit_layout && !editing && <button className="subtle-button" onClick={beginEditing} disabled={!layoutQuery.data || guideStep !== null}><Move3D size={16} />채널 위치 편집</button>}
                <details className="display-help"><summary>화면 설명</summary><p>드래그로 회전하고 휠로 확대합니다. 오른쪽 드래그로 화면을 옮깁니다.</p><p>설비는 공정을 설명하는 모형입니다. 실제 치수·채널 부착 위치·운전 속도를 재현한 것은 아닙니다.</p><p>열기와 색은 존의 온도값을 표현한 효과입니다. 실제 외벽·강판 온도나 열해석 결과는 아닙니다.</p><p>날짜와 시각은 원자료에 적힌 값입니다. 원자료의 시간대는 아직 확인되지 않았습니다.</p></details>
              </div>
            </details>
            {editing && <div className="editing-actions"><button className="subtle-button" onClick={cancelEditing} disabled={saving}>취소</button><button className="primary-button" onClick={() => void saveLayout()} disabled={saving || !dirty || layoutConflict}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}위치 저장</button></div>}
          </div>
          <div className="equipment-body">
            <div className="equipment-stage">
              {channels.length ? <Suspense fallback={<div className="scene-placeholder"><LoaderCircle className="spin" size={24} /><span>3D 설비를 불러오는 중</span></div>}><FurnaceScene channels={channels} selectedChannel={selectedChannel} onSelectChannel={selectSceneChannel} values={frameValues} placements={placements} onPlacementChange={editing ? changePlacement : undefined} editing={editing} showInterior={showInterior} appearance={appearance} theme={theme} alertChannelIds={guideStep ? [] : alertChannelIds} alertZoneIds={guideStep ? [] : alertZoneIds} motionPlaying={motionPlaying && !editing} overlayOpen={drawer !== null} /></Suspense> : <div className="scene-placeholder">{channelsQuery.isPending ? <><LoaderCircle className="spin" size={24} /><span>채널 정보를 불러오는 중</span></> : <><Box size={28} /><span>채널 정보를 불러오면 설비를 표시합니다.</span></>}</div>}
            </div>
            <aside className="channel-inspector" aria-label="선택한 채널 정보">
              <div className="inspector-heading"><h3>{channel?.id ?? "채널 선택"}</h3><span className="zone-badge">{channel?.zone || "—"}</span></div>
              <div className={`main-reading ${frameQuery.isFetching ? "is-loading" : ""}`}><strong>{numberText(frameValue?.value)}</strong><span>{channel?.unit || "단위 미확인"}</span></div>
              <p className="inspector-measured-time">{frameValue?.measured_at ? dateTime(frameValue.measured_at, true) : frameQuery.isFetching ? "불러오는 중" : "관측값 없음"}</p>
              {frameValue?.quality_status === "stale" && <p className="inspector-stale">선택 시각보다 오래된 값입니다.</p>}
              <ErrorMessage error={frameQuery.error} retry={() => void frameQuery.refetch()} />
              <div className="inspector-actions">
                <button className="inspector-graph-button" onClick={() => { selectChannel(selectedChannel); goToSection("channels"); }} disabled={!lot}>그래프 보기<ArrowRight size={16} /></button>
                <details className="channel-help"><summary>설명</summary><div><p>{channel?.label ?? "설비의 표시점을 눌러 주세요."}</p><p>값 아래 시각은 실제 기록 시각입니다. 위에서 고른 시각과 다를 수 있습니다.</p><p>{frameQuery.isFetching ? "불러오는 중" : frameValue ? ({ observed: "관측값 있음", missing: "관측값 없음", stale: "선택한 시각보다 오래된 값", time_threshold_unset: "관측 간격 기준 미설정" }[frameValue.quality_status] ?? "상태 확인 필요") : "아직 불러오지 않음"}</p></div></details>
              </div>
            </aside>
          </div>
          <ErrorMessage error={layoutQuery.error} retry={() => void layoutQuery.refetch()} />
          {editing && <div className="editing-instructions"><Move3D size={18} /><span>채널을 고르고 화살표로 옮긴 뒤 <strong>위치 저장</strong>을 누르세요.</span></div>}
        </section>
        <WorkspaceDrawer open={drawer === "analysis"} title="과거 LOT의 이상 후보" name="analysis" onClose={() => setDrawer(null)}>
        <div className="analysis-channel-choice"><span>분석할 채널</span><div className="segmented-control"><button onClick={() => setChannelGroup("all")}>전체</button><button onClick={() => setChannelGroup("TC")}>TC</button><button onClick={() => setChannelGroup("OP")}>OP</button><button onClick={() => setChannelGroup("selected")}>선택한 채널만</button></div><p>{displayedChannels.map(item => item.id).join(" · ") || "선택한 채널 없음"}</p></div>
        {lot && <DetectionPanel runs={runs} run={chosenRun} candidates={candidates} selectedId={focusedCandidate?.id ?? null}
          selectedChannels={displayedChannels.map(item => item.id)} loading={runsQuery.isPending || (!!chosenRunId && candidatesQuery.isPending)} running={analysisRunning}
          error={analysisError ?? runsQuery.error ?? candidatesQuery.error} disabled={editing || guideStep !== null}
          onRun={() => void runAnalysis()} onChooseRun={id => { setRunChoice({ context: analysisContext, id }); setSelectedCandidateId(null); setBannerCandidateId(null); }}
          onFocus={candidate => focusCandidate(candidate)} onRequest={setRequestCandidate}
          onAcknowledge={candidate => void acknowledgeCandidate(candidate)} acknowledging={acknowledging} />}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "channels"} title="채널 그래프와 앞뒤 기록" name="channels" onClose={() => setDrawer(null)}>
        {focusedCandidate && <div className="focused-candidate-actions"><span>선택한 후보 · {focusedCandidate.channel_id} · {dateTime(focusedCandidate.start, true)}</span><button className="primary-button compact" onClick={() => setRequestCandidate(focusedCandidate)}>현장 확인 요청</button></div>}
        <section className="panel channel-selection-panel" aria-labelledby="channel-heading" ref={chartTarget}>
          <div className="channel-controls-heading">
            <div><h2 id="channel-heading">표시할 채널</h2><span className="muted">{visibleIds.filter(id => channels.some(item => item.id === id)).length} / {channels.length}개 선택</span></div>
            <div className="segmented-control" aria-label="채널 빠른 선택">
              <button onClick={() => setChannelGroup("all")} aria-pressed={channels.length > 0 && visibleIds.length === channels.length}>전체</button>
              <button onClick={() => setChannelGroup("TC")} aria-pressed={visibleIds.length > 0 && visibleIds.every(id => id.startsWith("TC-"))}>TC</button>
              <button onClick={() => setChannelGroup("OP")} aria-pressed={visibleIds.length > 0 && visibleIds.every(id => id.startsWith("OP-"))}>OP</button>
              <button onClick={() => setChannelGroup("selected")} aria-pressed={visibleIds.length === 1 && visibleIds[0] === selectedChannel}>선택한 채널만</button>
            </div>
          </div>
          <div className="channel-chips">{channels.map(item => <button key={item.id} className={`channel-chip ${visibleIds.includes(item.id) ? "is-on" : ""} ${selectedChannel === item.id ? "is-focused" : ""}`} aria-pressed={visibleIds.includes(item.id)} aria-label={`${item.id} 그래프 ${visibleIds.includes(item.id) ? "숨기기" : "표시"}`} onClick={() => setVisibleIds(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])}><span>{visibleIds.includes(item.id) ? <Check size={11} /> : null}</span>{item.id}</button>)}</div>
        </section>
        {lot && view ? <>
          <ErrorMessage error={seriesQuery.error} retry={() => void seriesQuery.refetch()} />
          <ChannelCharts channels={displayedChannels} series={seriesQuery.data?.series ?? []} view={view} fullRange={{ start: lot.start, end: lot.end }}
            selectedChannel={selectedChannel} selection={selection} cursor={frameTime}
            loading={seriesQuery.isFetching} aggregationSeconds={seriesQuery.data?.aggregation_seconds} sourceCount={seriesQuery.data?.source_count}
            labelIntervals={seriesQuery.data?.label_intervals ?? []}
            candidates={candidates} focusedCandidate={focusedCandidate}
            onSelectChannel={selectChannel} onSelection={setSelection} onView={setView} onCursor={setCursor} />
          <section className="time-navigation panel" aria-label="3D와 그래프의 공통 시각">
            <div><span className="eyebrow">SHARED TIME</span><strong>{cursor ? dateTime(cursor, true) : "—"}</strong><span className="muted">그래프와 설비가 같은 시각을 봅니다.</span></div>
            <div className="shared-time-slider"><span>{clockTime(lot.start)}</span><input type="range" min={timeMs(lot.start)} max={timeMs(lot.end)} step={1000} value={cursor ? timeMs(cursor) : timeMs(lot.start)} aria-label="3D와 그래프에서 확인할 시각" onChange={event => {
              const value = new Date(Number(event.target.value)).toISOString().slice(0, 23);
              setCursor(value);
            }} /><span>{clockTime(lot.end)}</span></div>
          </section>
          <RecordsPanel datasetId={datasetId} view={view} />
        </> : lotsQuery.isFetching || datasetsQuery.isPending ? <div className="panel data-loading"><LoaderCircle size={20} className="spin" />관측 자료를 불러오는 중</div> : null}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "requests"} title="팀 확인 요청" name="requests" onClose={() => setDrawer(null)}>
          <FieldRequestsPanel user={user} selectedRequestId={selectedRequestId} focusRevision={requestFocusRevision} onOpenCandidate={location => void openCandidateLocation(location)} />
        </WorkspaceDrawer>
        <footer className="workspace-footer"><span>{user.display_name} · {fieldTeam ? "현장 작업팀" : "모니터링팀"}</span><span>과거 자료 · 원자료 시각 기준</span></footer>
      </main>
    </div>
    {requestCandidate && <RequestDialog key={requestCandidate.id} candidate={requestCandidate} onClose={() => setRequestCandidate(null)} onSaved={(request, reused) => {
      setRequestCandidate(null); void queryClient.invalidateQueries({ queryKey: ["field-requests"] });
      setMessage({ kind: "success", text: reused ? "이미 저장된 요청을 불러왔습니다." : "현장 확인 요청을 저장했습니다. 팀 알림에 반영됩니다." });
      openRequests(request.id);
    }} />}
  </div>;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [user, setUser] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api<{ user: User | null }>("/api/me", { signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => { if (sessionQuery.data?.user) setUser(sessionQuery.data.user); }, [sessionQuery.data]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111411" : "#f1f2ed");
    try { localStorage.setItem("cal01-theme", theme); } catch { /* Private browser storage may be unavailable. */ }
  }, [theme]);
  const toggleTheme = () => setTheme(value => value === "dark" ? "light" : "dark");
  function loggedIn(nextUser: User) {
    setUser(nextUser);
    queryClient.setQueryData(["session"], { user: nextUser });
  }
  function loggedOut() {
    setUser(null);
    queryClient.setQueryData(["session"], { user: null });
  }
  if (sessionQuery.isPending && !user) return <div className="app-loading"><Brand /><LoaderCircle size={23} className="spin" /><span>작업 공간을 확인하는 중</span></div>;
  return user ? <Workspace user={user} onLogout={loggedOut} theme={theme} onThemeToggle={toggleTheme} /> : <Login onLogin={loggedIn} theme={theme} onThemeToggle={toggleTheme} sessionError={sessionQuery.error} />;
}
