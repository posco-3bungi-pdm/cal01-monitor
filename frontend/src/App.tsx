import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity, ArrowDown, ArrowRight, Box, Check, ChevronDown, Database, Eye,
  EyeOff, FileSpreadsheet, Layers3, LoaderCircle, LogOut, Moon,
  Move3D, PanelLeftClose, PanelLeftOpen, RefreshCw, Save, ShieldCheck, Sun,
  UserRound, X, AlertCircle, BookOpen, ChevronLeft, ChevronRight,
} from "lucide-react";
import { api, ApiError, queryString, refreshCsrf } from "./api";
import type { Channel, CurrentFrame, Dataset, EquipmentLayout, Lot, Placement, SeriesResponse, Theme, TimeRange, User } from "./types";
import { clockTime, dateTime, numberText, timeMs } from "./time";
import ChannelCharts from "./components/ChannelCharts";
import RecordsPanel from "./components/RecordsPanel";
import { GUIDE_STEPS } from "./guide-data";

const FurnaceScene = lazy(() => import("./components/FurnaceScene"));

type Message = { kind: "success" | "error" | "info"; text: string };
type GuideContext = {
  datasetId: string; lotNo: string; selectedChannel: string; visibleIds: string[];
  view: TimeRange | null; selection: TimeRange | null; cursor: string | null;
  section: "equipment" | "channels"; scrollY: number;
};
const initialTheme = (): Theme => {
  try { return localStorage.getItem("cal01-theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
};

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "compact" : ""}`}><span className="brand-symbol"><i /><i /><i /></span><span>CAL<span className="brand-number">01</span></span>{!compact && <small>FIELD / MONITOR</small>}</div>;
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
        <span className="eyebrow"><span className="tiny-cross">+</span> CONTINUOUS ANNEALING LINE</span>
        <h1>설비의 흐름을 보고,<br /><em>같은 구간을<br className="mobile-break" /> 함께 확인.</em></h1>
        <p>채널값과 설비 위치를 한 화면에서.<br />모니터링팀과 현장팀이 같은 기록을 봅니다.</p>
        <div className="login-line-drawing" aria-hidden="true"><span className="schematic-baseline" /><span className="schematic-zone zone-one" /><span className="schematic-zone zone-two" /><span className="schematic-zone zone-three" /><span className="schematic-zone zone-four" /><span className="schematic-strip" /><span className="schematic-pin" /><span className="schematic-label">CAL01 · ZONE / CHANNEL</span></div>
        <div className="login-story-footer"><span>01 / OBSERVE</span><span>02 / UNDERSTAND</span><span>03 / COLLABORATE</span></div>
      </motion.section>
      <motion.section className="login-form-panel" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <span className="section-number">TEAM ACCESS</span>
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
    <footer className="login-footer"><span>CAL01 / TEAM WORKSPACE</span><span>데이터는 서버에, 판단은 함께.</span></footer>
  </main>;
}

function Workspace({ user, onLogout, theme, onThemeToggle }: { user: User; onLogout: () => void; theme: Theme; onThemeToggle: () => void }) {
  const queryClient = useQueryClient();
  const fieldTeam = /field|현장/i.test(user.team);
  const [section, setSection] = useState<"equipment" | "channels">(fieldTeam ? "channels" : "equipment");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [datasetId, setDatasetId] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("TC-Z3");
  const [visibleIds, setVisibleIds] = useState<string[]>(["TC-Z3", "OP-Z3", "CP-Z4"]);
  const [view, setView] = useState<TimeRange | null>(null);
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showInterior, setShowInterior] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftPlacements, setDraftPlacements] = useState<Placement[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [layoutConflict, setLayoutConflict] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const guideContext = useRef<GuideContext | null>(null);
  const chartTarget = useRef<HTMLDivElement>(null);
  const firstLotKey = useRef("");
  const enteredTeamSection = useRef(false);
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
    }
  }, [datasetId, lot]);
  useEffect(() => {
    if (channels.length && !channels.some(item => item.id === selectedChannel)) setSelectedChannel(channels[0].id);
  }, [channels, selectedChannel]);
  useEffect(() => {
    if (!fieldTeam || !lot || !view || enteredTeamSection.current) return;
    enteredTeamSection.current = true;
    const timeout = window.setTimeout(() => chartTarget.current?.scrollIntoView({ block: "start" }), 100);
    return () => window.clearTimeout(timeout);
  }, [fieldTeam, lot, view]);
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

  function selectChannel(id: string) {
    setSelectedChannel(id);
    setVisibleIds(previous => previous.includes(id) ? previous : [...previous, id]);
  }

  function startGuide() {
    if (guideIndex !== null || editing) return;
    guideContext.current = {
      datasetId, lotNo, selectedChannel, visibleIds: [...visibleIds], view, selection, cursor,
      section, scrollY: window.scrollY,
    };
    setGuideIndex(0);
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
    if (window.innerWidth <= 760) setSidebarOpen(false);
    if (next === "channels") window.setTimeout(() => chartTarget.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" }), 50);
    else window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  }

  const fatalAuth = [datasetsQuery.error, channelsQuery.error, lotsQuery.error, frameQuery.error, seriesQuery.error].some(error => error instanceof ApiError && error.status === 401);
  if (fatalAuth) return <div className="session-expired"><ShieldCheck size={36} /><h1>다시 로그인해 주세요.</h1><p>로그인이 만료됐습니다. 저장된 자료는 서버에 남아 있습니다.</p><button className="primary-button" onClick={() => { queryClient.clear(); onLogout(); }}>로그인 화면으로<ArrowRight size={16} /></button></div>;

  return <div className={`workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
    <aside className="sidebar" aria-label="작업 메뉴">
      <div className="sidebar-brand"><Brand compact /><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="메뉴 접기"><PanelLeftClose size={17} /></button></div>
      <div className="workspace-label"><span className="status-dot neutral" />CAL01 WORKSPACE</div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="main-navigation">
        <button className={section === "equipment" ? "active" : ""} onClick={() => goToSection("equipment")}><Box size={18} /><span>설비 관제</span><ArrowRight size={14} /></button>
        <button className={section === "channels" ? "active" : ""} onClick={() => goToSection("channels")}><Activity size={18} /><span>채널 확인</span><ArrowRight size={14} /></button>
      </nav>
      <div className="sidebar-source">
        <div className="sidebar-section-label">DATA SOURCE</div>
        <label htmlFor="dataset-select">현재 데이터</label>
        <div className="select-wrap"><select id="dataset-select" value={datasetId} onChange={event => { setDatasetId(event.target.value); setLotNo(""); setView(null); setCursor(null); firstLotKey.current = ""; }} disabled={datasetsQuery.isPending || !datasets.length}>
          {!datasets.length && <option>{datasetsQuery.isPending ? "불러오는 중…" : "등록된 자료 없음"}</option>}
          {datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select><ChevronDown size={14} /></div>
        {dataset && <div className="source-meta"><span><FileSpreadsheet size={13} />{dataset.row_count.toLocaleString()}행</span><span>{lots.length ? `${lots.length} LOT` : dataset.status}</span></div>}
        <ErrorMessage error={datasetsQuery.error} retry={() => void datasetsQuery.refetch()} />
        <label htmlFor="lot-select">확인할 LOT</label>
        <div className="select-wrap"><select id="lot-select" value={lotNo} onChange={event => setLotNo(event.target.value)} disabled={lotsQuery.isPending || !lots.length}>
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
        <div className="breadcrumb">{!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="메뉴 펼치기"><PanelLeftOpen size={18} /></button>}<span>CAL01</span><span className="breadcrumb-slash">/</span><strong>{section === "equipment" ? "설비 관제" : "채널 확인"}</strong></div>
        <div className="topbar-right"><span className="mode-badge"><Database size={12} />과거 자료 조회</span><button className={`subtle-button guide-toggle ${guideStep ? "is-active" : ""}`} onClick={guideStep ? closeGuide : startGuide} disabled={editing} aria-pressed={guideStep !== null}><BookOpen size={14} />{guideStep ? "가이드 종료" : "가이드 모드"}</button><span className="topbar-team">{fieldTeam ? "FIELD TEAM" : "MONITORING TEAM"}</span><ThemeButton theme={theme} onToggle={onThemeToggle} /></div>
      </header>
      <main className="main-content">
        <section className="page-intro">
          <div><span className="eyebrow">CONTINUOUS ANNEALING / CAL01</span><h1>{fieldTeam ? "같은 구간에서, 함께 확인." : "설비와 채널, 한눈에."}</h1><p>설비의 표시점을 누르면 같은 채널의 그래프가 연결됩니다.</p></div>
          <div className="intro-reference"><span>SELECTED LOT</span><strong>{lot ? String(lot.lot_no) : "—"}</strong><small>{lot?.grade || "자료 선택 대기"}</small></div>
        </section>
        {guideStep && guideIndex !== null && <section className="guide-panel" aria-label="공정과 채널 읽기 가이드" aria-live="polite">
          <div className="guide-panel-top"><span className="eyebrow"><BookOpen size={13} />GUIDE MODE</span><span>{guideIndex + 1} / {GUIDE_STEPS.length}</span><button className="icon-button" onClick={closeGuide} aria-label="가이드 닫고 이전 화면으로 돌아가기"><X size={16} /></button></div>
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
        <section className="panel equipment-panel" aria-labelledby="equipment-heading">
          <div className="panel-heading">
            <div><span className="eyebrow">EQUIPMENT VIEW</span><h2 id="equipment-heading">연속 소둔로 <span className="technical-tag">CAL01</span></h2></div>
            <div className="button-row">
              <button className={`subtle-button ${showInterior ? "is-active" : ""}`} aria-pressed={showInterior} onClick={() => setShowInterior(value => !value)}><Layers3 size={15} />{showInterior ? "외함 보기" : "내부 보기"}</button>
              {user.can_edit_layout && !editing && <button className="subtle-button" onClick={beginEditing} disabled={!layoutQuery.data || guideStep !== null}><Move3D size={15} />표시점 편집</button>}
              {editing && <><button className="subtle-button" onClick={cancelEditing} disabled={saving}><X size={14} />취소</button><button className="primary-button compact" onClick={() => void saveLayout()} disabled={saving || !dirty || layoutConflict}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}위치 저장</button></>}
            </div>
          </div>
          <div className="equipment-body">
            <div className="equipment-stage">
              <div className="stage-meta"><span className="stage-coordinate">ZONES / CHANNELS</span><span>{editing ? "표시점 편집 중" : "드래그 회전 · 스크롤 확대"}</span></div>
              {channels.length ? <Suspense fallback={<div className="scene-placeholder"><LoaderCircle className="spin" size={24} /><span>3D 설비를 불러오는 중</span></div>}><FurnaceScene channels={channels} selectedChannel={selectedChannel} onSelectChannel={selectChannel} values={frameValues} placements={placements} onPlacementChange={editing ? changePlacement : undefined} editing={editing} showInterior={showInterior} theme={theme} /></Suspense> : <div className="scene-placeholder">{channelsQuery.isPending ? <><LoaderCircle className="spin" size={24} /><span>채널 정보를 불러오는 중</span></> : <><Box size={28} /><span>채널 정보를 불러오면 설비를 표시합니다.</span></>}</div>}
            </div>
            <aside className="channel-inspector" aria-label="선택한 채널 정보">
              <div className="inspector-heading"><span className="eyebrow">SELECTED CHANNEL</span><span className="zone-badge">{channel?.zone || "—"}</span></div>
              <h3>{channel?.id ?? "채널 선택"}</h3>
              <p className="channel-description">{channel?.label ?? "설비의 표시점을 눌러 주세요."}</p>
              <div className={`main-reading ${frameQuery.isFetching ? "is-loading" : ""}`}><strong>{numberText(frameValue?.value)}</strong><span>{channel?.unit || "단위 미확인"}</span></div>
              <div className="inspector-fields">
                <div><span>원자료 기록 시각</span><strong>{frameValue?.measured_at ? dateTime(frameValue.measured_at, true) : "관측값 없음"}</strong></div>
                <div><span>그래프에서 고른 시각</span><strong>{cursor ? dateTime(cursor, true) : "—"}</strong></div>
                <div><span>자료 상태</span><strong>{frameQuery.isFetching ? "불러오는 중" : frameValue ? ({ observed: "관측값 있음", missing: "관측값 없음", stale: "선택한 시각보다 오래된 값", time_threshold_unset: "관측 간격 기준 미설정" }[frameValue.quality_status] ?? "상태 확인 필요") : "아직 불러오지 않음"}</strong></div>
              </div>
              <ErrorMessage error={frameQuery.error} retry={() => void frameQuery.refetch()} />
              <button className="inspector-graph-button" onClick={() => { selectChannel(selectedChannel); goToSection("channels"); }} disabled={!lot}><span>이 채널 그래프 보기</span><ArrowDown size={17} /></button>
              <div className="inspector-note"><ShieldCheck size={14} /><span>표시된 값은 선택한 과거 시각의 관측값입니다. 실시간 이상 경고가 아닙니다.</span></div>
            </aside>
          </div>
          <ErrorMessage error={layoutQuery.error} retry={() => void layoutQuery.refetch()} />
          {editing && <div className="editing-instructions"><Move3D size={15} /><span>표시점을 선택하고 이동 도구로 위치를 옮긴 뒤 <strong>위치 저장</strong>을 눌러 주세요.</span><span className="revision-label">REV {savedRevision.current}</span></div>}
        </section>
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
        <footer className="workspace-footer"><span>CAL01 / {fieldTeam ? "FIELD TEAM" : "MONITORING TEAM"}</span><span>원자료 시각 기준 · 시간대 미확인</span></footer>
      </main>
    </div>
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
