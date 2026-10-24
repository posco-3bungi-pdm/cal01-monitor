import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { emptyInspection, inspectionState } from './components/inspection-state';
import type { CSSProperties, FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity, ArrowRight, Box, Check, ChevronDown, Database, Eye,
  EyeOff, FileSpreadsheet, Layers3, LoaderCircle, LogOut, Moon, ScanLine,
  Move3D, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, ShieldCheck, Sun,
  UserRound, X, AlertCircle, BookOpen, Play, Pause, ClipboardList,
  FileUp, Gauge, Thermometer, SkipForward, Settings2, Droplets, BrainCircuit, Search,
} from "lucide-react";
import { api, ApiError, queryString, refreshCsrf } from "./api";
import type { Channel, CurrentFrame, Dataset, EquipmentLayout, Lot, Placement, SeriesResponse, Theme, TimeRange, User } from "./types";
import { clockTime, dateTime, timeMs, timeIso } from "./time";
import ChannelCharts from "./components/ChannelCharts";
import RecordsPanel from "./components/RecordsPanel";
import { GUIDE_STEPS } from "./guide-data";
import DetectionPanel from "./components/DetectionPanel";
import PendingAttention from "./components/PendingAttention";
import IncidentDetails from "./components/IncidentDetails";
import { outstandingCandidates, candidatesInLot, advanceReplayAttention, reachedCandidates } from "./components/attention-state";
import RequestDialog from "./components/RequestDialog";
import TeamNotifications from "./components/TeamNotifications";
import FieldRequestsPanel from "./components/FieldRequestsPanel";
import WorkspaceDrawer from "./components/WorkspaceDrawer";
import type { CandidateLocation, DetectionCandidate, DetectionRun, FieldRequest } from "./review-types";
import { usePlayback } from "./usePlayback";
import { useBottomControls } from './useBottomControls';
import CsvImportDialog from "./components/CsvImportDialog";
import { PART_CATALOG } from "./components/part-catalog";
import ModelSelectionPanel from "./components/ModelSelectionPanel";
import type { AnalysisModel } from "./components/ModelSelectionPanel";
import ThemedSelect from "./components/ThemedSelect";
import { measurementGroupId, summarizeMeasurementAttention } from "./components/zone-attention";
import CPInfo from './components/CPInfo';
import ProcessGuide from "./components/ProcessGuide";
import ResponseGuide from "./components/ResponseGuide";
import { sceneChannelIds } from "./components/scene-label-groups";
import type { SceneLabelState } from "./components/scene-label-groups";
import HistorySearchDialog from "./components/HistorySearchDialog";
import { sceneMotion } from "./components/scene-motion";
import FullscreenButton from "./components/FullscreenButton";
import ReadingValue from "./components/ReadingValue";
import CoilProductInfo from "./components/CoilProductInfo";
import { zoneForChannel } from "./components/furnace-model";
import { measurementName } from "./components/process-readouts";

import { useCsvSimulation } from './useCsvSimulation';
import LiveSimulationCharts from './LiveSimulationCharts';
import PlaybackShortcuts from './PlaybackShortcuts';
import { useModelPredictions } from './useModelPredictions';
import LivePredictionsPanel from './LivePredictionsPanel';
import { liveAttention, modelName } from './model-predictions';
import type { LiveModel, ModelEvent } from './model-predictions';

const FurnaceScene = lazy(() => import("./components/FurnaceScene"));

type Message = { kind: "success" | "error" | "info"; text: string };
type DrawerName = "channels" | "analysis" | "requests" | "models" | "response" | "incident" | null;
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
  const [incidentOrigin, setIncidentOrigin] = useState<Exclude<DrawerName, null | 'incident'>>('analysis');
  const [drawerWidths, setDrawerWidths] = useState<Record<string, number>>({});
  const reportDrawerWidth = useCallback((name: string, width: number) => {
    setDrawerWidths(previous => previous[name] === width ? previous : { ...previous, [name]: width });
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dataMode, setDataMode] = useState<'history' | 'live'>('history');
  const history = dataMode === 'history';
  const [simulationDatasetId, setSimulationDatasetId] = useState('');
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [sceneClose, setSceneClose] = useState(false);
  const [replayAttention, setReplayAttention] = useState({ context: '', through: Number.NaN });
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
  const [inspection, inspect] = useReducer(inspectionState, emptyInspection);
  const inspectorOpen = inspection.pinned, previewZone = inspection.preview;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepReadingPreview = useCallback(() => {
    if (previewTimer.current !== null) clearTimeout(previewTimer.current);
    previewTimer.current = null;
  }, []);
  const resetReadingInspection = useCallback(() => { keepReadingPreview(); inspect({ type: 'clear' }); }, [keepReadingPreview]);
  const closeReadingInspection = useCallback(() => { keepReadingPreview(); inspect({ type: 'dismiss' }); }, [keepReadingPreview]);
  const leaveReadingPreview = useCallback(() => {
    keepReadingPreview();
    // Allow the pointer to cross the small gap into the reading panel.
    previewTimer.current = setTimeout(() => { previewTimer.current = null; inspect({ type: 'leave' }); }, 180);
  }, [keepReadingPreview]);
  useEffect(() => () => keepReadingPreview(), [keepReadingPreview]);
  const [importOpen, setImportOpen] = useState(false);
  const [sceneLabels, setSceneLabels] = useState<SceneLabelState>({ group: 'all', shown: true });
  const [sceneToolsOpen, setSceneToolsOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [temperatureColors, setTemperatureColors] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [openedCandidate, setOpenedCandidate] = useState<DetectionCandidate | null>(null);
  const [sceneFocus, setSceneFocus] = useState<{ zoneId: string; channelId?: string; mode?: 'work' | 'full'; serial: number } | null>(null);
  const [cpViewActive, setCpViewActive] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<AnalysisModel>("zscore");
  const [liveModel, setLiveModel] = useState<LiveModel>("randomforest");
  const [selectedModelEvent, setSelectedModelEvent] = useState<ModelEvent | null>(null);
  const [requestModelEvent, setRequestModelEvent] = useState<ModelEvent | null>(null);
  const [modelGraphRange, setModelGraphRange] = useState<TimeRange | null>(null);
  const [runChoice, setRunChoice] = useState<{ context: string; id: string } | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [, setBannerCandidateId] = useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<DetectionCandidate | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [requestCandidate, setRequestCandidate] = useState<DetectionCandidate | null>(null);
  const [manualRequestOpen, setManualRequestOpen] = useState(false);
  const [pendingRequestFocus, setPendingRequestFocus] = useState<FieldRequest | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestFocusRevision, setRequestFocusRevision] = useState(0);
  const [responseCandidate, setResponseCandidate] = useState<DetectionCandidate | null>(null);
  const workspaceRoot = useRef<HTMLDivElement>(null);
  useBottomControls(workspaceRoot);
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
  const simulationLotsQuery = useQuery({
    queryKey: ['lots', simulationDatasetId], enabled: !!simulationDatasetId,
    queryFn: ({ signal }) => api<{ lots: Lot[] }>('/api/lots?' + queryString({ dataset: simulationDatasetId }), { signal }),
  });
  const layoutQuery = useQuery({
    queryKey: ["layout"], queryFn: ({ signal }) => api<EquipmentLayout>("/api/equipment/layout", { signal }),
  });
  const datasets = datasetsQuery.data?.datasets ?? [];
  const channels = channelsQuery.data?.channels ?? [];
  const lots = lotsQuery.data?.lots ?? [];
  const dataset = datasets.find(item => item.id === datasetId);
  const lot = lots.find(item => String(item.lot_no) === lotNo);
  const playback = usePlayback(datasetId, lot, setCursor);
  const simulationLots = simulationLotsQuery.data?.lots ?? [];
  const simulationDataset = datasets.find(item => item.id === simulationDatasetId);
  const simulationRange = useMemo(() => simulationLots.length ? {
    start: simulationLots.reduce((first, item) => item.start < first ? item.start : first, simulationLots[0].start),
    end: simulationLots.reduce((last, item) => item.end > last ? item.end : last, simulationLots[0].end),
  } : null, [simulationLotsQuery.data]);
  const simulation = useCsvSimulation(simulationDatasetId, simulationRange);
  const simulationLot = simulationLots.find(item => String(item.lot_no) === simulation.frame?.lot_no);
  const liveDetection = useModelPredictions(simulationDatasetId, simulation.frame, liveModel, !history && simulation.engaged, simulation.ended, simulation.runId);
  const liveEvents = liveDetection.result?.events ?? [];
  useEffect(() => { setSelectedModelEvent(null); setModelGraphRange(null); }, [simulationDatasetId, simulation.frame?.lot_no, liveModel]);
  const activeLot = history ? lot : simulationLot;
  const activeDatasetId = history ? datasetId : simulationDatasetId;
  const showLabels = sceneLabels.shown && (history || simulation.engaged);
  const sceneMovement = sceneMotion(history ? playback.running : simulation.running, motionPlaying, Boolean(editing || reducedMotion));
  useEffect(() => {
    if (datasets.length && !datasets.some(item => item.id === simulationDatasetId)) {
      const source = datasets.find(item => /sim_|시뮬레이션|simulation/i.test(item.name));
      if (source) setSimulationDatasetId(source.id);
    }
  }, [datasets, simulationDatasetId]);
  useEffect(() => {
    if (!history && simulationRange && !simulation.engaged) simulation.play();
  }, [history, simulationRange?.start, simulationRange?.end, simulation.engaged, simulation.play]);
  const selectedPart = PART_CATALOG.find(item => item.id === selectedPartId);
  const channel = channels.find(item => item.id === selectedChannel);
  const displayedChannels = useMemo(() => channels.filter(item => visibleIds.includes(item.id)), [channels, visibleIds]);
  const sceneLabelIds = useMemo(() => sceneLabels.group ? sceneChannelIds(channels, sceneLabels.group, selectedChannel) : visibleIds,
    [channels, sceneLabels.group, selectedChannel, visibleIds]);
  const analysisContext = `${datasetId}:${lotNo}`;
  const runsQuery = useQuery({
    queryKey: ["detection-runs", datasetId, lotNo], enabled: history && !!datasetId && !!lotNo,
    queryFn: ({ signal }) => api<{ runs: DetectionRun[] }>(`/api/detection/runs?${queryString({ dataset: datasetId, lot: lotNo })}`, { signal }),
    refetchInterval: 5000,
  });
  const runs = runsQuery.data?.runs ?? [];
  const chosenRunId = runChoice?.context === analysisContext && runs.some(run => run.id === runChoice.id) ? runChoice.id : runs[0]?.id;
  const chosenRun = runs.find(run => run.id === chosenRunId);
  const candidatesQuery = useQuery({
    queryKey: ["detection-candidates", datasetId, lotNo, chosenRunId], enabled: history && !!chosenRunId,
    queryFn: ({ signal }) => api<{ candidates: DetectionCandidate[] }>(`/api/detection/candidates?${queryString({ dataset: datasetId, lot: lotNo, run: chosenRunId })}`, { signal }),
    refetchInterval: 5000,
  });
  const candidates = candidatesQuery.data?.candidates ?? [];
  const pendingQuery = useQuery({ queryKey: ["detection-pending"], queryFn: ({ signal }) => api<{ candidates: DetectionCandidate[]; count: number; truncated: boolean }>("/api/detection/pending", { signal }), refetchInterval: 5000 });
  const pendingCandidates = useMemo(() => outstandingCandidates(pendingQuery.data?.candidates ?? candidates), [pendingQuery.data, candidates]);
  const pendingInLot = useMemo(() => candidatesInLot(pendingCandidates, datasetId, lotNo), [pendingCandidates, datasetId, lotNo]);
  // A LOT switch renders once before its cursor-reset effect. Do not expose
  // the next LOT's future events using the previous LOT's clock.
  const replayNow = history && lot ? timeMs(firstLotKey.current === analysisContext && cursor ? cursor : lot.start) : Number.NaN;
  const reachedThrough = advanceReplayAttention(replayAttention, analysisContext, replayNow).through;
  useEffect(() => {
    if (Number.isFinite(replayNow) && guideIndex === null) {
      setReplayAttention(previous => advanceReplayAttention(previous, analysisContext, replayNow));
    }
  }, [analysisContext, replayNow, guideIndex]);
  const focusedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId)
    ?? pendingCandidates.find(candidate => candidate.id === selectedCandidateId)
    ?? (openedCandidate?.id === selectedCandidateId ? openedCandidate : undefined);
  const visibleCandidates = useMemo(() => history ? reachedCandidates(pendingInLot, reachedThrough) : [], [history, pendingInLot, reachedThrough]);
  const alertChannelKey = guideStep ? "" : [...new Set(history ? visibleCandidates.map(candidate => candidate.channel_id) : liveEvents.filter(event => event.kind === "Z-score").flatMap(event => event.channel_ids))].join(",");
  const alertZoneKey = guideStep ? "" : [...new Set(history ? visibleCandidates.map(candidate => candidate.zone_id) : liveEvents.map(event => event.zone_id))].join(",");
  const alertChannelIds = useMemo(() => alertChannelKey ? alertChannelKey.split(",") : [], [alertChannelKey]);
  const alertZoneIds = useMemo(() => alertZoneKey ? alertZoneKey.split(",") : [], [alertZoneKey]);
  const zoneAttention = useMemo(() => guideStep ? {} : history ? summarizeMeasurementAttention(visibleCandidates) : liveAttention(liveEvents), [history, visibleCandidates, liveDetection.result, guideStep]);
  const staticCursor = playback.engaged ? null : cursor;
  const frameQuery = useQuery({
    queryKey: ["frame", datasetId, lotNo, staticCursor], enabled: history && !!datasetId && !!lot && !!staticCursor,
    queryFn: ({ signal }) => api<CurrentFrame>(`/api/current-frame?${queryString({ dataset: datasetId, lot: lotNo, at: staticCursor ?? undefined })}`, { signal }),
  });
  const seriesQuery = useQuery({
    queryKey: ["series", datasetId, lotNo, visibleIds.join(","), view?.start, view?.end],
    enabled: history && !!datasetId && !!lot && !!view && visibleIds.length > 0,
    queryFn: ({ signal }) => api<SeriesResponse>(`/api/series?${queryString({ dataset: datasetId, lot: lotNo, channels: visibleIds.join(","), start: view?.start, end: view?.end, max_points: 1000 })}`, { signal }),
  });
  const frameValues = useMemo(() => !history ? simulation.frame?.values ?? {} : playback.engaged
    ? playback.frame?.values ?? {}
    : Object.fromEntries((frameQuery.data?.channels ?? []).map(item => [item.channel_id, item.value])), [history, simulation.frame, frameQuery.data, playback.engaged, playback.frame]);
  const observationFor = (id: string) => !history ? {
    value: simulation.frame?.values[id] ?? null, measured_at: simulation.frame?.time ?? null,
    quality_status: simulation.frame ? 'simulation_record' : 'simulation_waiting',
  } : playback.engaged ? {
    value: playback.frame?.values[id] ?? null,
    measured_at: playback.frame?.time ?? null,
    quality_status: playback.frame ? (playback.frame.values[id] == null ? "missing" : "replay_record") : "replay_gap",
  } : frameQuery.data?.channels.find(item => item.channel_id === id);
  const inspectionChannel = previewZone === 'CP' ? channels.find(item => item.id === 'CP-Z4M')
    : previewZone ? channels.find(item => !item.id.startsWith('CP-') && zoneForChannel(item) === previewZone) : channel;
  const inspectionId = inspectionChannel?.id ?? selectedChannel;
  const showInspector = inspectorOpen || previewZone !== null;
  const frameValue = observationFor(inspectionId);
  const cpInspector = showInspector && inspectionId.startsWith('CP-') && !guideStep;
  const inspectionChannels = cpInspector ? channels.filter(item => item.id.startsWith('CP-'))
    : channels.filter(item => !item.id.startsWith('CP-') && zoneForChannel(item) === (inspectionChannel ? zoneForChannel(inspectionChannel) : ''));
  const groupedInspector = inspectionChannels.length > 1;
  const previewSceneZone = useCallback((zoneId: string) => {
    // Hover only previews readings. It never changes the camera, graph selection, or a draft.
    if (inspectorOpen || (!history && !simulation.frame) || editing || guideIndex !== null || drawer || sidebarOpen || sceneToolsOpen || selectedPartId
      || importOpen || historySearchOpen || requestCandidate || manualRequestOpen) return;
    keepReadingPreview();
    inspect({ type: 'enter', zone: zoneId });
  }, [history, simulation.frame, editing, guideIndex, drawer, sidebarOpen, sceneToolsOpen, selectedPartId, importOpen, historySearchOpen, requestCandidate, manualRequestOpen, inspectorOpen, selectedChannel, keepReadingPreview]);
  const frameTime = !history ? simulation.frame?.time ?? null : playback.engaged ? cursor : frameQuery.data?.anchor_time ?? cursor;
  const measuredAt = !history ? simulation.frame?.time ?? null : playback.engaged ? playback.frame?.time ?? null : frameQuery.data?.channels[0]?.measured_at ?? null;
  const placements = draftPlacements ?? layoutQuery.data?.placements ?? [];
  const dirty = editing && draftPlacements !== null && JSON.stringify(draftPlacements) !== JSON.stringify(layoutQuery.data?.placements);

  useEffect(() => {
    if (datasets.length && !datasets.some(item => item.id === datasetId)) setDatasetId(datasets.find(item => !/sim_|시뮬레이션|simulation/i.test(item.name))?.id ?? datasets[0].id);
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
      resetReadingInspection();
      setSelectedPartId(null);
    }
  }, [datasetId, lot]);
  useEffect(() => {
    if (pendingFocus && lot && datasetId === pendingFocus.dataset_id && String(lot.lot_no) === String(pendingFocus.lot_no)) {
      focusCandidate(pendingFocus);
      setPendingFocus(null);
    }
  }, [pendingFocus, lot, datasetId]);
  useEffect(() => {
    if (pendingRequestFocus && lot && datasetId === pendingRequestFocus.dataset_id && String(lot.lot_no) === String(pendingRequestFocus.lot_no)) {
      openRequestGraph(pendingRequestFocus);
      setPendingRequestFocus(null);
    }
  }, [pendingRequestFocus, lot, datasetId]);
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
      if (event.key !== "Escape" || document.fullscreenElement || document.querySelector("dialog[open]")) return;
      if (guideIndex !== null) closeGuide();
      else if (sidebarOpen) setSidebarOpen(false);
      else if (drawer) setDrawer(null);
      else if (sceneToolsOpen) { setSceneToolsOpen(false); setShowDiagnostics(false); }
      else { closeReadingInspection(); setSelectedPartId(null); }
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [guideIndex, sidebarOpen, drawer, sceneToolsOpen]);
  useEffect(() => {
    const root = workspaceRoot.current;
    if (!root) return;
    let down: { id: number; x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      down = event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };
    const pointerUp = (event: PointerEvent) => {
      const start = down; down = null;
      if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const target = event.target;
      if (!(target instanceof Element) || !root.contains(target) || editing || document.querySelector('dialog[open]')) return;
      // Reading, scrolling, editing and interacting with the current panel must not dismiss it.
      if (target.closest('.workspace-topbar, .workspace-drawer:not([hidden]), .guide-panel, .channel-inspector, .part-inspector, .equipment-alert, .scene-alert-chip, .sidebar:not([hidden]), .scene-tools, .notification-center, .zone-navigation, .scene-data-control, .playback-control, .pending-alert-banner, .live-model-banner')) return;
      if (root.querySelector('.workspace-drawer:not([hidden]) [data-preserve-outside="true"]')) return;
      // The process guide stays open while the learner examines its related 3D process.
      if (guideIndex !== null && target.closest('canvas, [data-scene-ui], [data-channel-readout]')) return;
      if (guideIndex !== null) closeGuide(false);
      setDrawer(null); setSidebarOpen(false); resetReadingInspection(); setSelectedPartId(null);
      setSceneToolsOpen(false);
      setShowDiagnostics(false);
    };
    root.addEventListener('pointerdown', pointerDown);
    root.addEventListener('pointerup', pointerUp);
    return () => { root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointerup', pointerUp); };
  }, [guideIndex, drawer, editing]);

  const selectChannel = useCallback((id: string) => {
    setSelectedChannel(id);
    setVisibleIds(previous => previous.includes(id) ? previous : [...previous, id]);
  }, []);

  function focusCandidate(candidate: DetectionCandidate, scroll = true) {
    if (guideIndex !== null) { setMessage({ kind: "info", text: "가이드를 종료한 뒤 실제 분석 후보를 열어 주세요." }); return; }
    if (editing) { setMessage({ kind: "info", text: "표시점 편집을 저장하거나 취소한 뒤 후보를 열어 주세요." }); return; }
    if (candidate.id !== selectedCandidateId && workspaceRoot.current?.querySelector('[data-preserve-outside="true"]')) { setMessage({ kind: "info", text: "작성 중인 내용을 저장하거나 취소한 뒤 다른 후보를 여십시오." }); return; }
    setOpenedCandidate(candidate);
    playback.clear();
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
    if (scroll) {
      setVisibleIds([candidate.channel_id]);
      setSceneFocus(previous => ({ zoneId: candidate.zone_id, channelId: candidate.channel_id.startsWith('CP-') ? 'CP-Z4' : undefined, serial: (previous?.serial ?? 0) + 1 }));
      openDrawer('incident', false);
    }
  }

  const selectSceneChannel = useCallback((id: string, keepSettings = false) => {
    selectChannel(id);
    keepReadingPreview(); inspect({ type: 'pin' });
    setSelectedPartId(null);
    setDrawer(null); setSidebarOpen(false);
    if (!keepSettings) setSceneToolsOpen(false);
    setShowDiagnostics(false);
  }, [selectChannel, keepReadingPreview]);
  const clearSceneSelection = useCallback(() => {
    resetReadingInspection(); setSelectedPartId(null);
  }, [resetReadingInspection]);
  const selectPart = useCallback((id: string, keepSettings = false) => {
    setSelectedPartId(id); resetReadingInspection(); setDrawer(null); setSidebarOpen(false); if (!keepSettings) setSceneToolsOpen(false); setShowDiagnostics(false);
  }, [resetReadingInspection]);

  function chooseTime(time: string) {
    playback.clear();
    setCursor(time);
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
    if (analysisModel !== "zscore" || !lot || analysisRunning || visibleIds.length === 0 || editing || guideIndex !== null) return;
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
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["detection-candidates"] }), queryClient.invalidateQueries({ queryKey: ["detection-pending"] })]);
      setMessage({ kind: "success", text: "읽음 표시를 저장했습니다. 미조치 알림과 구역 강조는 조치 완료 전까지 유지합니다." });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "확인 상태를 저장하지 못했습니다." }); }
    finally { setAcknowledging(null); }
  }

  async function resolveCandidate(candidate: DetectionCandidate, note: string) {
    if (resolving) return;
    setResolving(true);
    try {
      const result = await api<{ candidate: DetectionCandidate }>(`/api/detection/candidates/${encodeURIComponent(candidate.id)}/resolve`, { method: 'POST', body: JSON.stringify({ note }) });
      setOpenedCandidate(result.candidate);
      queryClient.setQueriesData<{ candidates: DetectionCandidate[] }>({ queryKey: ['detection-candidates'] }, previous => previous ? { ...previous, candidates: previous.candidates.map(item => item.id === candidate.id ? result.candidate : item) } : previous);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['detection-pending'] }), queryClient.invalidateQueries({ queryKey: ['detection-candidates'] })]);
      setMessage({ kind: 'success', text: '조치 기록을 저장했습니다. 완료 기록은 저장된 분석에서 다시 볼 수 있습니다.' });
    } finally { setResolving(false); }
  }

  function incidentRange(mode: 'candidate' | 'context' | 'lot') {
    if (!focusedCandidate || !lot) return;
    if (mode === 'lot') { setView({ start: lot.start, end: lot.end }); return; }
    const padding = mode === 'context' ? 300_000 : 30_000;
    setView({ start: timeIso(Math.max(timeMs(lot.start), timeMs(focusedCandidate.start) - padding)), end: timeIso(Math.min(timeMs(lot.end), timeMs(focusedCandidate.end) + padding)) });
  }

  function openRequests(requestId?: string) {
    setSelectedRequestId(requestId ?? null);
    setRequestFocusRevision(value => value + 1);
    openDrawer("requests", false);
  }

  function dismissTransientPanels(keepSettings = false) {
    if (guideIndex !== null) closeGuide(false);
    setDrawer(null); setSidebarOpen(false); resetReadingInspection(); setSelectedPartId(null);
    if (!keepSettings) setSceneToolsOpen(false);
    setShowDiagnostics(false);
  }

  function sceneAction(action: () => void, keepSettings = false) {
    dismissTransientPanels(keepSettings);
    action();
  }

  function toggleCPInspector() {
    const close = cpViewActive;
    dismissTransientPanels();
    setCpViewActive(!close);
    if (close) {
      setSceneFocus(previous => ({ zoneId: 'Z4', mode: 'full', serial: (previous?.serial ?? 0) + 1 }));
    } else {
      selectSceneChannel('CP-Z4');
      setSceneFocus(previous => ({ zoneId: 'Z4', channelId: 'CP-Z4', serial: (previous?.serial ?? 0) + 1 }));
    }
  }

  function changeDataMode(next: 'history' | 'live') {
    if (editing || analysisRunning || requestCandidate || manualRequestOpen || importOpen) return;
    playback.pause(); simulation.pause(); dismissTransientPanels(); setHistorySearchOpen(false); setDataMode(next);
    if (next === 'live') {
      setSelectedCandidateId(null); setDrawer('channels'); setSection('channels');
      simulation.play();
    }
  }

  function openHistorySearch() {
    if (editing || analysisRunning) return;
    simulation.pause(); playback.pause(); dismissTransientPanels(); setDataMode('history'); setHistorySearchOpen(true);
  }

  function focusModelEvent(event: ModelEvent) {
    simulation.pause(); setSelectedModelEvent(event);
    const eventLot = simulationLots.find(item => item.lot_no === (event.lot_no ?? simulationLot?.lot_no));
    const zoneChannels = channels.filter(item => zoneForChannel(item) === event.zone_id);
    const ids = zoneChannels.map(item => item.id);
    if (ids.length) { setVisibleIds(ids); setSelectedChannel(ids.find(id => id.startsWith('TC-')) ?? ids[0]); }
    setSceneFocus(previous => ({ zoneId: event.zone_id, serial: (previous?.serial ?? 0) + 1 }));
    setModelGraphRange({ start: timeIso(Math.max(timeMs(eventLot?.start ?? event.start), timeMs(event.start) - 60_000)),
      end: timeIso(Math.min(timeMs(simulation.frame?.time ?? event.end), timeMs(eventLot?.end ?? event.end), timeMs(event.end) + 60_000)) });
    setDrawer('channels'); setSection('channels');
  }

  function requestModelInspection(event: ModelEvent) {
    focusModelEvent(event); setRequestModelEvent(event); setManualRequestOpen(true);
  }

  function beginManualRequest() {
    if (!activeLot || !activeDatasetId || !channels.length) return;
    playback.pause(); simulation.pause(); setRequestModelEvent(null); setSceneToolsOpen(false); setShowDiagnostics(false); setManualRequestOpen(true);
  }

  function openRequestGraph(request: FieldRequest) {
    simulation.pause(); setDataMode('history');
    if (request.candidate_id) { void openCandidateLocation({ candidate_id: request.candidate_id, dataset_id: request.dataset_id, lot_no: request.lot_no, run_id: request.run_id ?? undefined }); return; }
    if (analysisRunning || editing || guideIndex !== null) { setMessage({ kind: 'info', text: '진행 중인 분석·편집·공정 읽기를 마친 뒤 요청 구간을 여십시오.' }); return; }
    playback.clear();
    if (!lot || datasetId !== request.dataset_id || lotNo !== String(request.lot_no)) {
      setPendingRequestFocus(request); setDatasetId(request.dataset_id); setLotNo(String(request.lot_no)); return;
    }
    setSelectedCandidateId(null); selectChannel(request.channel_id);
    const padding = Math.max(30_000, (timeMs(request.end) - timeMs(request.start)) * 0.3);
    setView({ start: timeIso(Math.max(timeMs(lot.start), timeMs(request.start) - padding)), end: timeIso(Math.min(timeMs(lot.end), timeMs(request.end) + padding)) });
    setCursor(request.start); goToSection('channels');
  }

  function openDrawer(name: Exclude<DrawerName, null>, toggle = true) {
    const next = toggle && drawer === name ? null : name;
    if (next === 'incident' && drawer !== 'incident') setIncidentOrigin(drawer ?? 'analysis');
    dismissTransientPanels();
    if (name !== 'requests' && name !== 'channels' && name !== 'models') { simulation.pause(); setDataMode('history'); }
    setDrawer(next);
    setSection(name === "channels" && next ? "channels" : "equipment");
  }

  function openResponseGuide(candidate?: DetectionCandidate) {
    setResponseCandidate(candidate ?? focusedCandidate ?? visibleCandidates[0] ?? null);
    openDrawer("response", false);
  }

  function startGuide() {
    simulation.pause(); setDataMode('history');
    if (guideIndex !== null || editing) return;
    playback.pause();
    guideContext.current = {
      datasetId, lotNo, selectedChannel, visibleIds: [...visibleIds], view, selection, cursor,
      section, drawer, scrollY: window.scrollY,
    };
    setGuideIndex(0);
    setDrawer(null);
    setSidebarOpen(false); resetReadingInspection(); setSelectedPartId(null);
    setSceneToolsOpen(false);
    setShowDiagnostics(false);
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

  function closeGuide(restoreDrawer = false) {
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
    setSection(restoreDrawer ? previous.section : "equipment");
    setDrawer(restoreDrawer ? previous.drawer : null);
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
    playback.pause();
    setDrawer(null);
    setMotionPlaying(false);
    setLayoutConflict(false);
    setMessage({ kind: "info", text: "3D의 표시점을 선택한 뒤 위치를 옮겨 주세요. 저장 전에는 다른 팀원에게 반영되지 않습니다." });
  }

  const changePlacement = useCallback((id: string, position: [number, number, number]) => {
    setDraftPlacements(previous => {
      if (!previous) return previous;
      const exists = previous.some(item => item.channel_id === id);
      return exists ? previous.map(item => item.channel_id === id ? { ...item, position } : item) :
        [...previous, { channel_id: id, zone_id: channels.find(item => item.id === id)?.zone ?? "", position }];
    });
  }, [channels]);

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
    simulation.pause(); playback.pause();
    setLogoutPending(true);
    try {
      await api("/api/logout", { method: "POST" });
      queryClient.clear();
      onLogout();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "로그아웃하지 못했습니다." }); }
    finally { setLogoutPending(false); }
  }

  function goToSection(next: "equipment" | "channels") {
    if (next === "channels") openDrawer("channels", false);
    else { dismissTransientPanels(); setSection("equipment"); }
  }

  useEffect(() => {
    const root = workspaceRoot.current, source = root?.querySelector<HTMLElement>('.scene-data-control');
    if (!root || !source) return;
    const update = () => root.style.setProperty('--source-card-bottom', `${source.getBoundingClientRect().bottom - root.getBoundingClientRect().top}px`);
    const observer = new ResizeObserver(update); observer.observe(source); update();
    return () => observer.disconnect();
  }, [history, lot?.lot_no, lot?.grade]);

  const fatalAuth = [datasetsQuery.error, channelsQuery.error, lotsQuery.error, frameQuery.error, seriesQuery.error].some(error => error instanceof ApiError && error.status === 401);
  if (fatalAuth) return <div className="session-expired"><ShieldCheck size={36} /><h1>다시 로그인해 주세요.</h1><p>로그인이 만료됐습니다. 저장된 자료는 서버에 남아 있습니다.</p><button className="primary-button" onClick={() => { queryClient.clear(); onLogout(); }}>로그인 화면으로<ArrowRight size={16} /></button></div>;

  return <div ref={workspaceRoot} data-scene-close={sceneClose} style={{ '--active-drawer-width': drawer ? `${drawerWidths[drawer] ?? 0}px` : undefined } as CSSProperties} className={`workspace immersive ${sidebarOpen ? "" : "sidebar-collapsed"} ${drawer ? "has-drawer" : ""} ${guideStep ? "has-guide" : ""} ${history && analysisModel === "zscore" && visibleCandidates.length > 0 && guideIndex === null ? "has-candidate" : ""}`}>
    <PlaybackShortcuts enabled={history && !!lot && !editing && !analysisRunning && guideIndex === null && !importOpen && !requestCandidate && !manualRequestOpen && !historySearchOpen}
      onToggle={() => { if (lot) playback.running ? playback.pause() : playback.play(cursor ?? lot.start); }}
      onStep={seconds => { if (lot) playback.seek(timeIso(Math.max(timeMs(lot.start), Math.min(timeMs(lot.end), timeMs(cursor ?? lot.start) + seconds * 1000))), playback.running); }} />
    <aside className="sidebar" aria-label="작업 메뉴" hidden={!sidebarOpen} onKeyDown={event => { if (event.key === "Escape") setSidebarOpen(false); }}>
      <div className="sidebar-brand"><Brand compact /><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="메뉴 접기"><PanelLeftClose size={17} /></button></div>
      <div className="sidebar-section-label">작업 화면</div>
      <nav className="main-navigation">
        <button className={section === "equipment" ? "active" : ""} onClick={() => goToSection("equipment")}><Box size={18} /><span>설비 관제</span><ArrowRight size={14} /></button>
        <button className={section === "channels" ? "active" : ""} onClick={() => goToSection("channels")}><Activity size={18} /><span>채널 확인</span><ArrowRight size={14} /></button>
        <button onClick={() => { if (window.innerWidth <= 760) setSidebarOpen(false); openRequests(); }}><ClipboardList size={18} /><span>팀 확인 요청</span><ArrowRight size={14} /></button>
        <button onClick={() => guideStep ? closeGuide() : startGuide()} disabled={editing || analysisRunning} aria-pressed={guideStep !== null} title="소둔로 공정의 흐름과 설비·계측 용어를 단계별로 살펴봅니다."><BookOpen size={18} /><span>소둔로 공정 가이드</span><ArrowRight size={14} /></button>
      </nav>
      <div className="sidebar-source" hidden={!history}>
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
        <div className="breadcrumb"><button className="icon-button" onClick={() => { const next = !sidebarOpen; dismissTransientPanels(); setSidebarOpen(next); }} aria-label={sidebarOpen ? "메뉴 접기" : "메뉴 펼치기"}><PanelLeftOpen size={20} /></button><Brand compact /><div className="data-mode-control" role="group" aria-label="자료 모드"><button aria-pressed={history} disabled={editing || analysisRunning} onClick={() => changeDataMode('history')}>과거 기록</button><button aria-pressed={!history} disabled={editing || analysisRunning} onClick={() => changeDataMode('live')}>실시간</button><button className="icon-button" aria-label="과거 기록 검색" title="과거 기록 검색" disabled={editing || analysisRunning || !datasets.length} onClick={openHistorySearch}><Search size={18} /></button></div></div>
        <nav className="immersive-navigation" aria-label="설비 위에서 열기">
          <button aria-label="예측 모델 선택" data-hint="분석 모델 선택" title={history ? "과거 분석 · Z-score" : liveModel === "randomforest" ? "RandomForestClassifier · 구역 예측" : liveModel === "zscore" ? "도착한 값 · Z-score" : "모델 예측 꺼짐"} aria-expanded={drawer === "models"} className={drawer === "models" ? "active" : ""} onClick={() => openDrawer("models")}><BrainCircuit size={17} /><span>모델</span></button>
          <ThemeButton theme={theme} onToggle={() => { setSceneToolsOpen(false); setShowDiagnostics(false); onThemeToggle(); }} />
          <button aria-label="채널 그래프 열기" data-hint="채널 그래프" title="채널 그래프 열고 닫기" className={drawer === "channels" ? "active" : ""} aria-expanded={drawer === "channels"} onClick={() => openDrawer("channels")}><Activity size={15} /><span>그래프</span></button>
        </nav>
        <div className="topbar-right"><FullscreenButton onError={text => setMessage({ kind: "error", text })} />
          <button className={`topbar-action icon-button${drawer === 'analysis' ? ' active' : ''}`} aria-label="과거 LOT 이상 후보 열기" data-hint="저장된 분석 보기 · 배지는 재생 중 발생한 미조치 수" aria-expanded={drawer === 'analysis'} onClick={() => openDrawer('analysis')}><AlertCircle size={19} />{visibleCandidates.length > 0 && <small>{visibleCandidates.length}</small>}</button>
          <button className={`topbar-action icon-button${drawer === 'requests' ? ' active' : ''}`} aria-label="팀 확인 요청함 열기" data-hint="팀 점검 요청" aria-expanded={drawer === 'requests'} onClick={() => openDrawer('requests')}><ClipboardList size={19} /></button>
          <TeamNotifications username={user.username} onOpen={dismissTransientPanels} onOpenCandidate={location => void openCandidateLocation(location)} onOpenRequests={openRequests} /></div>
      </header>
      <main className="main-content">
        {history ? <section className="scene-data-control" aria-label="현재 보고 있는 자료">
          <button className="icon-button" aria-label="온도 CSV 불러오기" title="CSV 불러오기" disabled={editing || analysisRunning || !!guideStep} onClick={() => { playback.pause(); setImportOpen(true); }}><FileUp size={21} /></button>
          <ThemedSelect id="scene-lot-select" label="LOT" value={lotNo} onChange={setLotNo}
            disabled={!lots.length || analysisRunning || editing || !!guideStep}
            options={lots.map(item => ({ value: String(item.lot_no), label: `${item.lot_no} · ${item.grade || "강종 미기록"}`, color: item.product?.color }))} />
          <div className="scene-recorded-time"><span>{playback.engaged ? "과거 기록 재생" : "선택 시각"}</span><strong>{cursor ? dateTime(cursor, true) : "불러오는 중"}</strong></div>
          {lot && <CoilProductInfo key={`${datasetId}:${lot.lot_no}`} datasetId={datasetId} lot={lot} disabled={editing || analysisRunning || !!guideStep} onOpen={dismissTransientPanels} />}
        </section> : <section className="scene-data-control live-source-status" aria-label="CSV 실시간 시연 상태">
          <div className="simulation-source-heading"><strong><i className={simulation.running ? 'simulation-dot running' : 'simulation-dot'} />CSV 시연</strong>
            <button className="icon-button" aria-label="시연 CSV 불러오기" title="시연 CSV 불러오기" onClick={() => { simulation.pause(); setImportOpen(true); }}><FileUp size={19} /></button></div>
          <ThemedSelect label="시연 CSV" value={simulationDatasetId} onChange={value => { simulation.pause(); setSimulationDatasetId(value); }}
            options={datasets.map(item => ({ value: item.id, label: item.name }))} />
          <strong>{simulation.frame ? dateTime(simulation.frame.time, true) : simulationDataset ? '첫 행을 기다리는 중' : '노트북에서 만든 CSV를 불러오세요'}</strong>
          <span>{simulation.frame ? 'LOT ' + simulation.frame.lot_no + ' · ' + (simulation.frame.grade || '강종 미기록') : '실제 설비 연결 아님'}</span>
          <small>{simulation.count.toLocaleString()} / {(simulationDataset?.row_count ?? 0).toLocaleString()}행 수집 · {simulation.speed}배속</small>
          {simulation.error && <p className="form-error" role="alert">{simulation.error}</p>}
          <ErrorMessage error={simulationLotsQuery.error} retry={() => void simulationLotsQuery.refetch()} />
        </section>}
        {history && lot && <section className="playback-control" aria-label="온도 기록 재생" title="Space 재생·정지, ←·→ 5초, Shift+←·→ 30초 이동">
          <button className="icon-button replay-toggle" aria-label={playback.running ? "기록 재생 일시정지" : "기록 재생"} title={playback.running ? "일시정지" : "기록 재생"} disabled={editing || !!guideStep || importOpen} onClick={() => playback.running ? playback.pause() : playback.play(cursor ?? lot.start)}>{playback.running ? <Pause size={21} /> : <Play size={21} />}</button>
          <div className="replay-track"><input type="range" min={timeMs(lot.start)} max={timeMs(lot.end)} step={1000} value={cursor ? timeMs(cursor) : timeMs(lot.start)} aria-label="온도 기록 재생 위치" disabled={editing || !!guideStep} onChange={event => playback.seek(timeIso(Number(event.target.value)))} /><div><span>{clockTime(lot.start)}</span><span>{playback.loading ? "자료 불러오는 중" : playback.engaged && !playback.frame ? "30초 내 기록 없음" : "원자료 시각"}</span><span>{clockTime(lot.end)}</span></div></div>
          <ThemedSelect label="기록 재생 속도" value={String(playback.speed)} onChange={value => playback.setSpeed(Number(value))}
            options={[1, 10, 30, 60, 300].map(speed => ({ value: String(speed), label: `${speed}×` }))} />
          {playback.engaged && !playback.frame && <button className="icon-button" aria-label="다음 기록으로 이동" title="다음 기록" onClick={playback.nextRecord}><SkipForward size={19} /></button>}
          {playback.error && <p className="form-error" role="alert">{playback.error}</p>}
        </section>}
        {!history && simulationRange && <section className="playback-control simulation-control" aria-label="CSV 시연 재생">
          <button className="icon-button replay-toggle" aria-label={simulation.running ? '시연 일시정지' : '시연 시작'} title={simulation.running ? '일시정지' : '시연 시작'} onClick={() => simulation.running ? simulation.pause() : simulation.play()}>{simulation.running ? <Pause size={21} /> : <Play size={21} />}</button>
          <div className="replay-track"><progress aria-label="시연 수집 진행" max={simulationDataset?.row_count || 1} value={simulation.count} /><div><span>{clockTime(simulationRange.start)}</span><span>{simulation.loading ? '다음 행 불러오는 중' : simulation.running ? '1배속 = 1초마다 1행' : '일시정지 또는 수집 완료'}</span><span>{clockTime(simulationRange.end)}</span></div></div>
          <ThemedSelect label="시연 재생 속도" value={String(simulation.speed)} onChange={value => simulation.setSpeed(Number(value))}
            options={[1, 10, 60, 300].map(speed => ({ value: String(speed), label: String(speed) + '×' }))} />
          <button className="icon-button" aria-label="시연 처음부터" title="처음부터" onClick={simulation.reset}><RefreshCw size={18} /></button>
        </section>}
        {guideStep && guideIndex !== null && <ProcessGuide index={guideIndex} onStep={moveGuide} onClose={() => closeGuide()} />}
        <AnimatePresence>{message && <motion.div initial={reducedMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`notice ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.kind === "success" ? <Check size={17} /> : <AlertCircle size={17} />}<span>{message.text}</span>{layoutConflict && <button className="text-button" onClick={() => void loadLatestLayout()}>최신 위치 불러오기</button>}<button className="icon-button" onClick={() => setMessage(null)} aria-label="안내 닫기"><X size={15} /></button>
        </motion.div>}</AnimatePresence>
        <ErrorMessage error={lotsQuery.error} retry={() => void lotsQuery.refetch()} />
        <ErrorMessage error={channelsQuery.error} retry={() => void channelsQuery.refetch()} />
        {!datasetsQuery.isPending && datasets.length === 0 && !datasetsQuery.error && <div className="panel no-data-panel"><Database size={30} /><h2>등록된 데이터가 없습니다.</h2><p>서버에 CSV를 등록하면 LOT와 채널값을 여기에서 확인할 수 있습니다.</p><button className="subtle-button" onClick={() => void datasetsQuery.refetch()}><RefreshCw size={14} />등록 상태 다시 확인</button></div>}
        {!history && !guideStep && liveEvents.length > 0 && <button className="live-model-banner" onClick={() => focusModelEvent(liveEvents.at(-1)!)}><AlertCircle size={20} /><span><strong>{liveEvents.at(-1)!.zone_id} · {modelName(liveEvents.at(-1)!.kind)} 이상 후보</strong><small>예측 구간 {liveDetection.result?.event_count ?? liveEvents.length}개 · 눌러서 도착한 값 확인</small></span><ArrowRight size={17} /></button>}
        {history && guideIndex === null && <PendingAttention candidates={visibleCandidates} count={visibleCandidates.length} error={pendingQuery.error} onRetry={() => void pendingQuery.refetch()} onSelect={candidate => focusCandidate(candidate)} />}
        <section className="panel equipment-panel" aria-labelledby="equipment-heading">
          <div className="panel-heading scene-toolbar">
            <h2 id="equipment-heading" className="visually-hidden">연속 소둔로 CAL01</h2>
            <div className="segmented-control appearance-control" role="group" aria-label="설비 표현 방식">
              <button aria-label="홀로그램 표현" data-hint="홀로그램 표현" title="홀로그램" aria-pressed={appearance === "hologram"} onClick={() => sceneAction(() => setAppearance("hologram"))}><Layers3 size={20} /></button>
              <button aria-label="금속 설비 표현" data-hint="금속 설비 표현" title="금속 설비" aria-pressed={appearance === "realistic"} onClick={() => sceneAction(() => setAppearance("realistic"))}><Box size={20} /></button>
            </div>
            <button className="icon-button" aria-label={showInterior ? '외함 보기' : '내부 보기'} data-hint={showInterior ? '외함 보기' : '내부 보기'} aria-pressed={showInterior} onClick={() => sceneAction(() => setShowInterior(value => !value))}><ScanLine size={20} /></button>
            <div className="temperature-control"><button className="subtle-button temperature-toggle" aria-label="코일 색상 · 구역 TC 색상 전환" aria-describedby="temperature-display-help" disabled={!history && !simulation.engaged} aria-pressed={temperatureColors} onClick={() => sceneAction(() => setTemperatureColors(value => !value))}><Thermometer size={20} /><span>코일 색상</span></button><span className="temperature-tooltip" id="temperature-display-help" role="tooltip">공정 안 강판의 색을 구역 TC로 표시합니다.<br />실제 코일 표면온도·강종 고유색·경보 등급이 아닌 설명용 색상입니다.</span></div>
            <div className="scene-tools">
              <button className="scene-tools-trigger icon-button" aria-label="화면 설정" data-hint="화면 설정" title="화면 설정" aria-expanded={sceneToolsOpen} onClick={() => { const next = !sceneToolsOpen; dismissTransientPanels(); setSceneToolsOpen(next); }}><Settings2 size={21} /></button>
              {sceneToolsOpen && <div className="scene-tools-menu" role="region" aria-label="화면 설정 항목">
                <div className="scene-settings-heading"><strong>화면 설정</strong><button className="icon-button" aria-label="화면 설정 닫기" onClick={() => { setSceneToolsOpen(false); setShowDiagnostics(false); }}><X size={16} /></button></div>
                <span className="settings-section-label">설비 살펴보기</span>
                <button className={`subtle-button ${motionPlaying ? "is-active" : ""}`} aria-pressed={motionPlaying} disabled={!!reducedMotion || editing} onClick={() => {
                  const next = !motionPlaying;
                  sceneAction(() => { setMotionPlaying(next); if (next) { setShowInterior(true); setSceneFocus(previous => ({ zoneId: 'CLN', mode: 'work', serial: (previous?.serial ?? 0) + 1 })); } }, true);
                }}><Droplets size={16} />세정·건조 동작 {motionPlaying ? "끄기" : "보기"}</button>
                <p className="scene-help-note">강판 이동과 세정·건조는 설명용 동작입니다.</p>
                {reducedMotion && <p>기기의 동작 줄이기 설정에 따라 재생을 껐습니다.</p>}
                <div className="scene-part-picker"><ThemedSelect label="확인할 설비 부품" value={selectedPartId ?? ""}
                  onChange={value => sceneAction(() => value ? selectPart(value) : setSelectedPartId(null))}
                  options={[{ value: "", label: "장비·부품 보기" }, ...PART_CATALOG.map(part => ({ value: part.id, label: `${part.zoneId} · ${part.name}` }))]} /></div>
                <details className="advanced-scene-tools"><summary>고급 도구</summary>
                  <button className="subtle-button diagnostics-preview-trigger" onPointerEnter={event => { if (event.pointerType !== 'touch') setShowDiagnostics(true); }} onPointerLeave={() => setShowDiagnostics(false)} onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setShowDiagnostics(true); }} onBlur={() => setShowDiagnostics(false)} aria-label="그래픽 성능 확인 · 커서를 올린 동안 표시"><Gauge size={16} /><span>그래픽 성능 확인<small>커서를 올린 동안만 표시</small></span></button>
                  {user.can_edit_layout && !editing && <button className="subtle-button" onClick={() => sceneAction(beginEditing, true)} disabled={!layoutQuery.data || guideStep !== null}><Move3D size={16} />채널 위치 편집</button>}
                </details>
                <details className="display-help"><summary>화면 설명</summary><p>드래그: 회전 · 휠: 확대 · WASD: 이동 · ↑/E: 상승 · ↓/Q: 하강 · Shift: 더 빠르게</p><p>설비를 한 번 누르면 키보드로 움직일 수 있습니다. 값창은 채널을 눌러 엽니다.</p><p>온도 색은 존의 TC 값을 표현합니다. 강판의 실제 표면온도가 아닙니다. 강종만으로 확인할 수 없는 표면 마감은 기본 금속으로 표시합니다.</p><p>부품 위치와 운전 동작은 공정 설명용입니다. 재생 중에는 마지막 기록을 최대 30초만 표시합니다. 화면 표시 기준이며 이상 판정이나 원본 값을 바꾸지 않습니다.</p></details>
              </div>}
            </div>
            {editing && <div className="editing-actions"><button className="subtle-button" onClick={cancelEditing} disabled={saving}>취소</button><button className="primary-button" onClick={() => void saveLayout()} disabled={saving || !dirty || layoutConflict}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}위치 저장</button></div>}
          </div>
          <div className="equipment-body">
            <div className="equipment-stage">
              {channels.length ? <Suspense fallback={<div className="scene-placeholder"><LoaderCircle className="spin" size={24} /><span>3D 설비를 불러오는 중</span></div>}><FurnaceScene
                sceneFocus={sceneFocus} onInspectZoneAlert={groupId => {
                  const candidate = visibleCandidates.find(item => measurementGroupId(item) === groupId);
                  if (candidate) focusCandidate(candidate);
                  else { const event = [...liveEvents].reverse().find(item => item.zone_id === groupId || groupId === "CP" && item.kind === "Z-score" && item.channel_ids.some(id => id.startsWith("CP-"))); if (event) focusModelEvent(event); }
                }}
                channels={channels} selectedChannel={inspectorOpen || editing || guideStep ? selectedChannel : ""} onSelectChannel={selectSceneChannel}
                values={frameValues} placements={placements} onPlacementChange={editing ? changePlacement : undefined}
                editing={editing} showInterior={showInterior} appearance={appearance} theme={theme}
                alertChannelIds={alertChannelIds} alertZoneIds={alertZoneIds} zoneAttention={zoneAttention}
                motionPlaying={sceneMovement.strip}
                simulationActive={sceneMovement.cleaning}
                overlayOpen={drawer !== null || sidebarOpen || importOpen || historySearchOpen || requestCandidate !== null || manualRequestOpen || guideStep !== null}
                overlaySide={drawer ? "right" : guideStep || sidebarOpen ? "left" : null}
                overlayWidth={drawer ? drawerWidths[drawer] : undefined}
                showLabels={editing || !!guideStep} visibleLabelIds={editing || guideStep ? visibleIds : sceneLabelIds} showDiagnostics={showDiagnostics && sceneToolsOpen}
                showZoneReadouts={showLabels && !editing && !guideStep && !selectedPartId} onPreviewZone={previewSceneZone} onPreviewLeave={leaveReadingPreview} readoutsDisabled={!history && !simulation.engaged} onCloseViewChange={setSceneClose}
                cpReadoutsSelected={cpViewActive} onToggleCPReadouts={toggleCPInspector} onCPViewChange={setCpViewActive}
                onToggleZoneReadouts={() => sceneAction(() => setSceneLabels(previous => ({ group: 'all', shown: !previous.shown })))}
                measuredAt={measuredAt} temperatureColors={temperatureColors && (history || simulation.engaged)} onClearSelection={clearSceneSelection}
                selectedPartId={selectedPartId} onSelectPart={selectPart}
              /></Suspense> : <div className="scene-placeholder">{channelsQuery.isPending ? <><LoaderCircle className="spin" size={24} /><span>채널 정보를 불러오는 중</span></> : <><Box size={28} /><span>채널 정보를 불러오면 설비를 표시합니다.</span></>}</div>}
            </div>
            {showInspector && <aside className="channel-inspector" aria-label="선택한 채널 정보" data-preview-zone={previewZone ?? undefined} data-pinned={inspectorOpen}
              onPointerEnter={keepReadingPreview} onPointerLeave={leaveReadingPreview} onFocus={keepReadingPreview}
              onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) leaveReadingPreview(); }}>
              <div className="inspector-heading"><h3>{cpInspector ? 'CP 계측' : groupedInspector ? `${inspectionChannel ? zoneForChannel(inspectionChannel) : ''} 계측` : inspectionId}</h3><span className="zone-badge">{inspectionChannel?.zone || "—"}</span><button className="icon-button" aria-label="채널 정보 닫기" onClick={closeReadingInspection}><X size={18} /></button></div>
              {cpInspector && <CPInfo />}
              {groupedInspector ? <div className="cp-readings">{inspectionChannels.map(item => {
                const id = item.id, observed = observationFor(id);
                return <section key={id} className="cp-reading" aria-label={`${id} 관측값`}><h4>{cpInspector ? id : measurementName(id)}</h4><div className="main-reading"><ReadingValue channelId={id} value={observed?.value} unit={item.unit} /></div><small>{observed?.measured_at ? clockTime(observed.measured_at, true) : '관측값 없음'}</small></section>;
              })}</div> : <><div className={`main-reading ${frameQuery.isFetching ? "is-loading" : ""}`}><ReadingValue channelId={inspectionId} value={frameValue?.value} unit={inspectionChannel?.unit || (inspectionId.startsWith('CP-') ? null : '단위 미확인')} /></div><p className="inspector-measured-time">{frameValue?.measured_at ? dateTime(frameValue.measured_at, true) : frameQuery.isFetching ? "불러오는 중" : "관측값 없음"}</p></>}
              {groupedInspector && <p className="inspector-measured-time">{frameTime ? dateTime(frameTime, true) : '선택 시각 없음'}</p>}
              {frameValue?.quality_status === "stale" && <p className="inspector-stale">선택 시각보다 오래된 값입니다.</p>}
              <ErrorMessage error={frameQuery.error} retry={() => void frameQuery.refetch()} />
              <div className="inspector-actions">
                <button className="inspector-graph-button" onClick={() => { selectChannel(inspectionId); if (groupedInspector) setVisibleIds(inspectionChannels.map(item => item.id)); goToSection("channels"); }} disabled={!lot}>{cpInspector ? 'CP 두 채널 그래프' : groupedInspector ? '구역 그래프 보기' : '그래프 보기'}<ArrowRight size={16} /></button>
                <details className="channel-help"><summary>설명</summary><div><p>{inspectionChannel?.label ?? "설비의 표시점을 눌러 주세요."}</p>{inspectionId.startsWith('CP-') && <p>CP-Z4는 무차원이다. CP-Z4M의 회색 e⁻¹⁰은 10의 -10승을 곱하는 배율이며 별도 측정 단위가 아니다.</p>}{inspectionId === "CP-Z4" && <p>Z4의 CP 채널 표시 위치입니다. 실제 설치 좌표나 특정 가스 분석계·프로브와의 연결은 제공 자료로 확인되지 않았습니다.</p>}<p>값 아래 시각은 실제 기록 시각입니다. 위에서 고른 시각과 다를 수 있습니다.</p><p>{frameQuery.isFetching ? "불러오는 중" : frameValue ? ({ observed: "관측값 있음", missing: "관측값 없음", stale: "선택한 시각보다 오래된 값", time_threshold_unset: "관측 간격 기준 미설정", replay_record: "마지막 기록 표시 · 최대 30초", replay_gap: "최근 30초 안에 기록 없음 · 재생 표시를 비움", simulation_record: "CSV 시연 수집값", simulation_waiting: "시연 행을 기다리는 중" }[frameValue.quality_status] ?? "상태 확인 필요") : "아직 불러오지 않음"}</p></div></details>
              </div>
            </aside>}
            {selectedPart && <aside className="part-inspector" aria-label="선택한 부품 정보">
              <header><h3>{selectedPart.name}</h3><button className="icon-button" aria-label="부품 정보 닫기" onClick={() => setSelectedPartId(null)}><X size={18} /></button></header>
              <span className="part-code">{selectedPart.partCode} · {selectedPart.zoneId}</span>
              <p>{selectedPart.description}</p>
              <p>{selectedPart.evidence === "cal01-replacement" ? "CAL01 부품 교체 기록에 있음." : selectedPart.evidence === "master-only" ? "부품마스터에 있음." : "제조사 자료를 참고한 장비 모형."} 부착 위치는 설명용 배치.</p>
              <details><summary>배치 근거</summary><p>{selectedPart.note}</p>{selectedPart.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</details>
            </aside>}
          </div>
          <ErrorMessage error={layoutQuery.error} retry={() => void layoutQuery.refetch()} />
          {editing && <div className="editing-instructions"><Move3D size={18} /><span>채널을 고르고 화살표로 옮긴 뒤 <strong>위치 저장</strong>을 누르세요.</span></div>}
        </section>
        <WorkspaceDrawer open={drawer === "analysis"} title="과거 LOT의 이상 후보" name="analysis" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth}>
        {analysisModel === "none" && <div className="analysis-rule"><p>추가 분석을 껐습니다. 저장된 Z-score 분석과 미조치 알림은 계속 확인할 수 있습니다.</p><button className="text-button" onClick={() => setAnalysisModel("zscore")}>Z-score 분석 켜기</button></div>}
        <div className="analysis-channel-choice"><span>분석할 채널</span><div className="segmented-control"><button onClick={() => setChannelGroup("all")}>전체</button><button onClick={() => setChannelGroup("TC")}>TC</button><button onClick={() => setChannelGroup("OP")}>OP</button><button onClick={() => setChannelGroup("selected")}>선택한 채널만</button></div><p>{displayedChannels.map(item => item.id).join(" · ") || "선택한 채널 없음"}</p></div>
        {lot && <DetectionPanel runs={runs} run={chosenRun} candidates={candidates} selectedId={focusedCandidate?.id ?? null}
          selectedChannels={displayedChannels.map(item => item.id)} loading={runsQuery.isPending || (!!chosenRunId && candidatesQuery.isPending)} running={analysisRunning}
          error={analysisError ?? runsQuery.error ?? candidatesQuery.error} disabled={analysisModel !== "zscore" || editing || guideStep !== null}
          onRun={() => void runAnalysis()} onChooseRun={id => { setRunChoice({ context: analysisContext, id }); setSelectedCandidateId(null); setBannerCandidateId(null); }}
          onFocus={candidate => focusCandidate(candidate)} onRequest={setRequestCandidate}
          onGuide={openResponseGuide}
          onAcknowledge={candidate => void acknowledgeCandidate(candidate)} acknowledging={acknowledging} />}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === 'incident'} title="구역 이상 상세" name="incident" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth} onBack={() => openDrawer(incidentOrigin, false)}>
          {focusedCandidate && view && <IncidentDetails key={focusedCandidate.id} candidate={focusedCandidate}
            zoneCandidates={visibleCandidates.filter(item => measurementGroupId(item) === measurementGroupId(focusedCandidate))} channel={channels.find(item => item.id === focusedCandidate.channel_id)}
            data={seriesQuery.data?.series.find(item => item.channel_id === focusedCandidate.channel_id)} view={view} loading={seriesQuery.isFetching} error={seriesQuery.error}
            pending={resolving || acknowledging !== null} onSelect={item => focusCandidate(item)} onRead={() => void acknowledgeCandidate(focusedCandidate)}
            onGuide={() => openResponseGuide(focusedCandidate)} onRequest={() => setRequestCandidate(focusedCandidate)} onOpenRequest={openRequests}
            onResolve={note => resolveCandidate(focusedCandidate, note)} onRange={incidentRange} onCursor={chooseTime} />}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "channels"} title="채널 그래프와 앞뒤 기록" name="channels" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth}>
        {!history && selectedModelEvent && <div className="live-focused-event"><strong>{selectedModelEvent.zone_id} · {modelName(selectedModelEvent.kind)} 이상 후보</strong><span>{dateTime(selectedModelEvent.start, true)} — {dateTime(selectedModelEvent.end, true)}</span><p>이 구역을 점검할 채널은 직접 고르면 됨. 모델이 고장 원인 채널을 찾았다는 뜻은 아님.</p><button className="text-button" onClick={() => requestModelInspection(selectedModelEvent)}>점검 요청 작성</button></div>}
        {history && focusedCandidate && <div className="focused-candidate-actions"><span>선택한 후보 · {focusedCandidate.channel_id} · {dateTime(focusedCandidate.start, true)}</span><button className="primary-button compact" onClick={() => setRequestCandidate(focusedCandidate)}>현장 확인 요청</button></div>}
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
        {!history ? <><LiveSimulationCharts frames={simulation.frames} channels={displayedChannels} selectedChannel={selectedChannel} onSelectChannel={selectChannel}
          datasetId={simulationDatasetId} focus={modelGraphRange} focusLot={selectedModelEvent?.lot_no} onClearFocus={() => { setModelGraphRange(null); setSelectedModelEvent(null); }} />
          <LivePredictionsPanel model={liveModel} {...liveDetection} selectedEvent={selectedModelEvent} onEvent={focusModelEvent} onRequest={requestModelInspection} onRetry={liveDetection.retry} /></> : lot && view ? <>
          <ErrorMessage error={seriesQuery.error} retry={() => void seriesQuery.refetch()} />
          <ChannelCharts channels={displayedChannels} series={seriesQuery.data?.series ?? []} view={view} fullRange={{ start: lot.start, end: lot.end }}
            selectedChannel={selectedChannel} selection={selection} cursor={frameTime}
            loading={seriesQuery.isFetching} aggregationSeconds={seriesQuery.data?.aggregation_seconds} sourceCount={seriesQuery.data?.source_count}
            labelIntervals={seriesQuery.data?.label_intervals ?? []}
            candidates={analysisModel === "zscore" ? candidates : []} focusedCandidate={analysisModel === "zscore" ? focusedCandidate : undefined}
            onSelectChannel={selectChannel} onSelection={setSelection} onView={setView} onCursor={chooseTime} />
          <section className="time-navigation panel" aria-label="3D와 그래프의 공통 시각">
            <div><span className="eyebrow">SHARED TIME</span><strong>{cursor ? dateTime(cursor, true) : "—"}</strong><span className="muted">그래프와 설비가 같은 시각을 봅니다.</span></div>
            <div className="shared-time-slider"><span>{clockTime(lot.start)}</span><input type="range" min={timeMs(lot.start)} max={timeMs(lot.end)} step={1000} value={cursor ? timeMs(cursor) : timeMs(lot.start)} aria-label="3D와 그래프에서 확인할 시각" onChange={event => {
              const value = new Date(Number(event.target.value)).toISOString().slice(0, 23);
              chooseTime(value);
            }} /><span>{clockTime(lot.end)}</span></div>
          </section>
          <RecordsPanel datasetId={datasetId} view={view} />
        </> : lotsQuery.isFetching || datasetsQuery.isPending ? <div className="panel data-loading"><LoaderCircle size={20} className="spin" />관측 자료를 불러오는 중</div> : null}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "requests"} title="팀 확인 요청" name="requests" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth}>
          <FieldRequestsPanel user={user} selectedRequestId={selectedRequestId} focusRevision={requestFocusRevision} onOpenRequest={openRequestGraph} onCreate={beginManualRequest} canCreate={!!activeLot && !!activeDatasetId && channels.length > 0} />
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "models"} title="분석 모델 선택" name="models" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth}>
          <ModelSelectionPanel live={!history} selected={history ? analysisModel : liveModel} disabled={analysisRunning || editing || !!guideStep}
            onSelect={model => history ? setAnalysisModel(model === "randomforest" ? "zscore" : model) : setLiveModel(model)} onOpenAnalysis={() => openDrawer("analysis", false)} />
          {!history && <LivePredictionsPanel model={liveModel} {...liveDetection} selectedEvent={selectedModelEvent} onEvent={focusModelEvent} onRequest={requestModelInspection} onRetry={liveDetection.retry} />}
        </WorkspaceDrawer>
        <WorkspaceDrawer open={drawer === "response"} title="알림 대응 가이드" name="response" onClose={() => setDrawer(null)} onWidthChange={reportDrawerWidth}>
          <ResponseGuide key={responseCandidate?.id ?? 'general'} candidate={responseCandidate} candidates={candidates} onOpenGraph={candidate => focusCandidate(candidate)} onRequest={setRequestCandidate} />
        </WorkspaceDrawer>
        <footer className="workspace-footer"><span>{user.display_name} · {fieldTeam ? "현장 작업팀" : "모니터링팀"}</span><span>{history ? '과거 기록 · 원자료 시각 기준' : 'CSV 실시간 시연 · 실제 설비 연결 아님'}</span></footer>
      </main>
    </div>
    {historySearchOpen && <HistorySearchDialog datasets={datasets} datasetId={datasetId} onClose={() => setHistorySearchOpen(false)} onSelect={(source, sourceLot) => {
      playback.clear(); setDataMode('history'); setHistorySearchOpen(false); setDatasetId(source); setLotNo(sourceLot);
      const selected = source === datasetId ? lots.find(item => String(item.lot_no) === sourceLot) : undefined;
      if (selected) { setView({ start: selected.start, end: selected.end }); setCursor(selected.start); setSelection(null); }
      setDrawer('channels'); setSection('channels');
    }} />}
    {importOpen && <CsvImportDialog onClose={() => setImportOpen(false)} onImported={(next, reused) => {
      setImportOpen(false);
      queryClient.setQueryData<{ datasets: Dataset[] }>(["datasets", user.username], previous => ({
        datasets: [next, ...(previous?.datasets ?? []).filter(item => item.id !== next.id)],
      }));
      if (!history) {
        simulation.pause(); setSimulationDatasetId(next.id);
      } else {
        setDatasetId(next.id); setLotNo(''); setView(null); setCursor(null); firstLotKey.current = ''; playback.clear();
      }
      setMessage({ kind: "success", text: reused ? "이미 등록된 같은 파일을 열었습니다." : `${next.row_count.toLocaleString()}행을 등록했습니다. ${history ? 'LOT를 골라 재생해 보세요.' : '실시간 시연을 시작합니다.'}` });
    }} />}
    {(requestCandidate || manualRequestOpen) && <RequestDialog key={requestCandidate?.id ?? requestModelEvent?.id ?? 'manual'} candidate={requestCandidate} modelContext={requestModelEvent}
      manualContext={{ dataset_id: activeDatasetId, lot_no: requestModelEvent?.lot_no ?? activeLot?.lot_no ?? '', channel_id: selectedChannel,
        start: history ? selection?.start ?? cursor ?? lot?.start ?? '' : requestModelEvent?.start ?? simulation.frame?.time ?? '',
        end: history ? selection?.end ?? cursor ?? lot?.start ?? '' : requestModelEvent?.end ?? simulation.frame?.time ?? '' }} channels={requestModelEvent ? channels.filter(item => zoneForChannel(item) === requestModelEvent.zone_id) : channels} lots={history ? lots : simulationLots}
      onClose={() => { setRequestCandidate(null); setRequestModelEvent(null); setManualRequestOpen(false); }} onSaved={(request, reused) => {
      setRequestCandidate(null); setRequestModelEvent(null); setManualRequestOpen(false); void queryClient.invalidateQueries({ queryKey: ["field-requests"] });
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
