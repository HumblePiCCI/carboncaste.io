const SVG_NS = 'http://www.w3.org/2000/svg';

const participantNames = {
  ben: 'Ben',
  mary: 'Mary',
  laura: 'Laura',
  brad: 'Brad',
};
const participantIds = Object.keys(participantNames);
const preferenceLabels = {
  love: 'Love it',
  interested: 'Interested',
  pass: 'Not for me',
  undecided: 'Undecided',
};
const lockedStatuses = new Set(['booked', 'fixed', 'locked', 'checked-in']);
const openStatuses = new Set(['open', 'conditional', 'backup', 'community']);
const experienceSourceTypes = new Set([
  'reviews',
  'travel post',
  'travel writing',
  'travel blog',
  'guide',
  'specialist',
]);
const placeMediaByOption = Object.freeze({
  'hellulaug-coast': {
    src: '/iceland26/media/hellulaug.webp',
    alt: 'The stone-edged Hellulaug hot pool beside the rocky Westfjords coast.',
  },
  raudasandur: {
    src: '/iceland26/media/raudasandur.webp',
    alt: 'The broad red-gold sand and distant headland at Rauðasandur.',
  },
  dynjandi: {
    src: '/iceland26/media/dynjandi.webp',
    alt: 'The broad upper cascade of Dynjandi waterfall.',
  },
  studlagil: {
    src: '/iceland26/media/studlagil.webp',
    alt: 'The turquoise river between basalt columns in Stuðlagil canyon.',
  },
  seydisfjordur: {
    src: '/iceland26/media/seydisfjordur.webp',
    alt: 'Aerial view of Seyðisfjörður’s white church and rainbow-painted street.',
  },
  'djupivogur-stokksnes': {
    src: '/iceland26/media/stokksnes.webp',
    alt: 'Vestrahorn rising beyond the dark beach at Stokksnes.',
  },
  'jokulsarlon-boat': {
    src: '/iceland26/media/jokulsarlon.webp',
    alt: 'Glacial ice on Diamond Beach across the road from Jökulsárlón.',
  },
  'fjadrargljufur-eldhraun': {
    src: '/iceland26/media/eldhraun.webp',
    alt: 'Pale green moss covering the Eldhraun lava field.',
  },
  reynisfjara: {
    src: '/iceland26/media/reynisfjara.webp',
    alt: 'Basalt columns and sea stacks at Reynisfjara.',
  },
  dyrholaey: {
    src: '/iceland26/media/dyrholaey.webp',
    alt: 'The Dyrhólaey sea arch above the Atlantic.',
  },
  'skogafoss-waterfall-way': {
    src: '/iceland26/media/skogafoss.webp',
    alt: 'Skógafoss dropping between vivid green slopes.',
  },
});
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function requiredElement(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Required Iceland route-room element is missing: ${selector}`);
  return node;
}

const elements = {
  participant: requiredElement('#participant-select'),
  logout: requiredElement('#logout-button'),
  syncDot: requiredElement('#sync-dot'),
  syncStatus: requiredElement('#sync-status'),
  baseline: requiredElement('#baseline-list'),
  tripDate: requiredElement('#trip-date'),
  currentTripState: requiredElement('#current-trip-state'),
  countDays: requiredElement('#count-days'),
  countOptions: requiredElement('#count-options'),
  countOpen: requiredElement('#count-open'),
  countAgreements: requiredElement('#count-agreements'),
  scrubber: requiredElement('#day-scrubber'),
  dateTrack: requiredElement('#date-track'),
  timelineLive: requiredElement('#timeline-live'),
  dayDate: requiredElement('#selected-day-date'),
  dayTitle: requiredElement('#day-rail-title'),
  dayState: requiredElement('#selected-day-state'),
  daySummary: requiredElement('#selected-day-summary'),
  driveReadout: requiredElement('#drive-readout'),
  orderCheck: requiredElement('#order-check'),
  stopList: requiredElement('#day-stop-list'),
  plannerShell: requiredElement('.planner-shell'),
  mapFrame: requiredElement('#map-frame'),
  mapSvg: requiredElement('#route-map-svg'),
  mapViewport: requiredElement('#map-viewport'),
  mapAttribution: requiredElement('.map-attribution'),
  mapFilter: requiredElement('#map-filter'),
  bonusLayer: requiredElement('#bonus-layer-toggle'),
  campingCardLayer: requiredElement('#camping-card-layer-toggle'),
  campingCardScope: requiredElement('#camping-card-scope'),
  zoomOut: requiredElement('#zoom-out'),
  zoomReset: requiredElement('#zoom-reset'),
  zoomIn: requiredElement('#zoom-in'),
  placePanel: requiredElement('#place-panel'),
  placeContent: requiredElement('#place-panel-content'),
  closePlace: requiredElement('#close-place-panel'),
  mapStory: requiredElement('#map-story-card'),
  mapStoryContent: requiredElement('#map-story-content'),
  closeMapStory: requiredElement('#close-map-story'),
  selectedVoting: requiredElement('#selected-place-voting'),
  selectedComments: requiredElement('#selected-place-comments'),
  alignmentCount: requiredElement('#alignment-count'),
  topAlignment: requiredElement('#top-alignment'),
  decisionCards: requiredElement('#decision-cards'),
  opsGrid: requiredElement('#ops-grid'),
  methodDetails: requiredElement('#method-details'),
  openIdea: requiredElement('#open-idea-dialog'),
  ideaDialog: requiredElement('#idea-dialog'),
  ideaForm: requiredElement('#idea-form'),
  ideaLocation: requiredElement('#idea-location'),
  closeIdea: requiredElement('#close-idea-dialog'),
  cancelIdea: requiredElement('#cancel-idea-dialog'),
  toast: requiredElement('#toast'),
};

let itinerary = null;
let mapData = null;
let bonusData = null;
let campingCardData = null;
let sharedState = {
  available: false,
  revision: 0,
  preferences: {},
  comments: [],
  suggestions: [],
  activity: [],
};
let selectedDayIndex = Math.max(0, Number(elements.scrubber.value) || 0);
let selectedOptionId = null;
let activeMapFilter = 'all';
let bonusLayerEnabled = true;
let campingCardLayerEnabled = true;
let campingCardScope = 'remaining';
let mapZoom = 1;
let panelOpen = true;
let refreshTimer = null;
let toastTimer = null;
let camperAnimation = null;
let camperProgress = null;
let camperNodes = [];
let projectedRoute = [];
let renderedPanelOptionId = null;
let mapChoiceMenu = null;
let mapChoiceReturnFocus = null;
let storyOpen = true;
const commentDrafts = new Map();
const pendingPreferenceOptions = new Set();

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  });
  return node;
}

function humanize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function firstText(...values) {
  const match = values.find((value) => (
    (typeof value === 'string' && value.trim())
    || typeof value === 'number'
  ));
  return match === undefined ? '' : String(match).trim();
}

function itemText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  const label = firstText(value.label, value.title, value.name);
  const detail = firstText(value.detail, value.body, value.note, value.description, value.value);
  if (label && detail && label !== detail) return `${label}: ${detail}`;
  if (label || detail) return label || detail;
  return Object.entries(value)
    .filter(([, child]) => typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean')
    .map(([key, child]) => `${humanize(key)}: ${child}`)
    .join(' · ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeUrl(raw, allowedProtocols = ['http:', 'https:']) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw, window.location.origin);
    return allowedProtocols.includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function appendSafeLink(parent, { url, label, className, protocols } = {}) {
  const parsed = safeUrl(url, protocols);
  if (!parsed) return null;
  const link = createElement('a', className, label || parsed.hostname || parsed.href);
  link.href = parsed.href;
  if (['http:', 'https:'].includes(parsed.protocol)) {
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
  }
  parent.append(link);
  return link;
}

function setSync(mode, message) {
  elements.syncDot.classList.toggle('is-live', mode === 'live');
  elements.syncDot.classList.toggle('is-saving', mode === 'saving');
  elements.syncDot.classList.toggle('is-error', mode === 'error');
  elements.syncStatus.textContent = message;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

function currentParticipant() {
  return participantIds.includes(elements.participant.value)
    ? elements.participant.value
    : null;
}

function requireParticipant() {
  const participant = currentParticipant();
  if (participant) return participant;
  elements.participant.focus();
  showToast('Choose your name first so the board knows whose preference this is.', true);
  return null;
}

function canWrite() {
  if (sharedState.available) return true;
  showToast('The shared board is temporarily read-only. Your draft is still here.', true);
  return false;
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened browsing contexts; the board remains usable.
  }
}

function focusSnapshot() {
  const active = document.activeElement;
  const key = active?.dataset?.focusKey;
  if (!key) return null;
  const snapshot = { key };
  if (typeof active.selectionStart === 'number') {
    snapshot.selectionStart = active.selectionStart;
    snapshot.selectionEnd = active.selectionEnd;
  }
  return snapshot;
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const target = [...document.querySelectorAll('[data-focus-key]')]
    .find((node) => node.dataset.focusKey === snapshot.key);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (typeof snapshot.selectionStart === 'number' && typeof target.setSelectionRange === 'function') {
    target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

function communityOptions() {
  return asArray(sharedState.suggestions).map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.title,
    shortTitle: suggestion.title,
    location: suggestion.location,
    status: 'community',
    standout: false,
    hook: suggestion.details,
    planningContext: `Added by ${participantNames[suggestion.createdBy] || 'the group'}.`,
    tags: ['community', 'open'],
    visit: { duration: 'Open', walk: 'To check', difficulty: 'To check' },
    family: {
      fit: 'Needs a family-fit check',
      stroller: 'To check',
      carrier: 'To check',
      hazards: [],
      notes: 'This is a group suggestion and has not yet had the route and safety pass applied.',
    },
    amenities: [],
    booking: { required: false, notes: 'Check only if this idea survives the group vote.' },
    pros: [],
    drawbacks: [],
    sources: [],
    dayIds: [],
    legId: 'shared-ideas',
    legTitle: 'Ideas from the group',
    createdBy: suggestion.createdBy,
    createdAt: suggestion.createdAt,
  }));
}

function allOptions() {
  const researched = asArray(itinerary?.legs).flatMap((leg) => (
    asArray(leg.options).filter((option) => option.active !== false).map((option) => ({
      ...option,
      legId: leg.id,
      legTitle: leg.title,
    }))
  ));
  return [...researched, ...communityOptions()];
}

function includedBonusStores() {
  return asArray(bonusData?.stores)
    .filter((store) => store.included)
    .map((store) => ({
      ...store,
      category: 'bonus-grocery',
      status: store.routeFit,
      dayIds: store.nearestDayId ? [store.nearestDayId] : [],
    }));
}

function isBonusStore(place) {
  return place?.category === 'bonus-grocery';
}

function includedCampingCardSites() {
  return asArray(campingCardData?.sites)
    .filter((site) => site.included)
    .map((site) => ({
      ...site,
      category: 'camping-card-site',
      status: site.routeFit,
      dayIds: site.nearestDayId ? [site.nearestDayId] : [],
    }));
}

function isCampingCardSite(place) {
  return place?.category === 'camping-card-site';
}

function isReferencePlace(place) {
  return isBonusStore(place) || isCampingCardSite(place);
}

function campingCardSiteMatchesScope(site) {
  if (campingCardScope === 'all') return true;
  if (campingCardScope === 'direct') return site.routeFit === 'direct';
  return site.routeFit === 'direct' || site.routeFit === 'conditional';
}

function allMapPlaces() {
  return [...allOptions(), ...includedBonusStores(), ...includedCampingCardSites()];
}

function placeById(placeId) {
  return allMapPlaces().find((place) => place.id === placeId) || null;
}

function optionById(optionId) {
  return allOptions().find((option) => option.id === optionId) || null;
}

function selectedDay() {
  const days = asArray(itinerary?.days);
  if (!days.length) return null;
  selectedDayIndex = Math.min(Math.max(0, selectedDayIndex), days.length - 1);
  return days[selectedDayIndex];
}

function selectedOption() {
  return placeById(selectedOptionId);
}

function optionDayIds(option) {
  if (!option) return [];
  const direct = asArray(option.dayIds).filter(Boolean);
  if (direct.length) return direct;
  return asArray(itinerary?.days)
    .filter((day) => asArray(day.stopIds).includes(option.id))
    .map((day) => day.id);
}

function votesFor(optionId) {
  const votes = sharedState.preferences?.[optionId];
  return votes && typeof votes === 'object' ? votes : {};
}

function consensusFor(optionId) {
  const votes = votesFor(optionId);
  const values = participantIds.map((participant) => votes[participant] || 'undecided');
  const love = values.filter((value) => value === 'love').length;
  const interested = values.filter((value) => value === 'interested').length;
  const pass = values.filter((value) => value === 'pass').length;
  const decided = love + interested + pass;
  const positive = love + interested;
  const agreement = positive === participantIds.length;
  const split = pass > 0 && positive > 0;
  const promising = positive === participantIds.length - 1 && pass === 0 && decided === positive;
  const score = (love * 3) + (interested * 2) - (pass * 2);
  return { love, interested, pass, decided, positive, agreement, split, promising, score };
}

function consensusText(consensus) {
  if (consensus.agreement) return 'Group yes · all four are in';
  if (consensus.split) return 'Worth a conversation · preferences differ';
  if (consensus.promising) return 'Promising · one voice left';
  if (consensus.decided === 0) return 'Open · nobody has weighed in yet';
  return `${consensus.decided}/4 planners have weighed in`;
}

function statusLabel(status) {
  const labels = {
    booked: 'Booked anchor',
    fixed: 'Fixed',
    locked: 'Locked',
    working: 'Working plan',
    planned: 'Current plan',
    priority: 'Research priority',
    open: 'Open call',
    conditional: 'Conditional',
    backup: 'Backup',
    community: 'Group suggestion',
    historical: 'Earlier plan',
    direct: 'Directly useful',
    'behind-current-route': 'Outside remaining route',
  };
  return labels[status] || humanize(status || 'working');
}

function renderBaseline() {
  const trip = itinerary?.trip || {};
  const dayCount = asArray(itinerary?.days).length;
  const direction = firstText(trip.direction, trip.routeDirection, 'clockwise circuit');
  elements.tripDate.textContent = [trip.dateLabel, dayCount ? `${dayCount} days` : '', direction]
    .filter(Boolean)
    .join(' · ');
  elements.baseline.replaceChildren();
  asArray(trip.baseline).forEach((item, index) => {
    const row = createElement('li');
    row.append(
      createElement('span', null, String(index + 1).padStart(2, '0')),
      document.createTextNode(itemText(item)),
    );
    elements.baseline.append(row);
  });

  const currentState = trip.currentState;
  const visible = Boolean(currentState?.asOf && currentState?.label);
  elements.currentTripState.hidden = !visible;
  elements.currentTripState.replaceChildren();
  if (visible) {
    const asOf = parseDate(currentState.asOf)?.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    elements.currentTripState.append(
      createElement('span', 'current-trip-banner__pulse'),
      createElement('strong', null, `Last confirmed${asOf ? ` · ${asOf}` : ''} · `),
      document.createTextNode(currentState.label),
    );
    elements.currentTripState.dataset.dayId = currentState.dayId || '';
    elements.currentTripState.dataset.placeId = currentState.currentPlaceId || '';
  }
}

function renderCounts() {
  const options = allOptions();
  const decisions = asArray(itinerary?.decisions);
  const explicitOpen = decisions.filter((decision) => {
    const state = String(decision?.state || decision?.status || 'open').toLowerCase();
    return !['resolved', 'closed', 'locked', 'complete', 'completed'].includes(state);
  }).length;
  const optionOpen = options.filter((option) => openStatuses.has(option.status)).length;
  const agreements = options.filter((option) => consensusFor(option.id).agreement).length;
  elements.countDays.textContent = String(asArray(itinerary?.days).length);
  elements.countOptions.textContent = String(allMapPlaces().filter((option) => mapCoordinate(option)).length);
  elements.countOpen.textContent = String(decisions.length ? explicitOpen : optionOpen);
  elements.countAgreements.textContent = String(agreements);
}

function renderReferenceLayerControls() {
  const sites = includedCampingCardSites();
  const directCount = sites.filter((site) => site.routeFit === 'direct').length;
  const remainingCount = sites.filter((site) => (
    site.routeFit === 'direct' || site.routeFit === 'conditional'
  )).length;
  const labels = {
    direct: `Direct fits · ${directCount}`,
    remaining: `Remaining route · ${remainingCount}`,
    all: `All sites · ${sites.length}`,
  };
  [...elements.campingCardScope.options].forEach((option) => {
    option.textContent = labels[option.value] || option.textContent;
  });
  elements.campingCardScope.value = campingCardScope;
  elements.campingCardScope.disabled = !campingCardLayerEnabled;
  elements.campingCardLayer.setAttribute(
    'aria-label',
    campingCardLayerEnabled
      ? `Camping Card campsite layer, showing ${labels[campingCardScope] || labels.remaining}`
      : `Camping Card campsite layer, hidden; scope set to ${labels[campingCardScope] || labels.remaining}`,
  );
}

function parseDate(date) {
  if (!date) return null;
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayInIceland() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateParts(day) {
  const parsed = parseDate(day?.date);
  const weekday = firstText(day?.weekday, parsed?.toLocaleDateString([], { weekday: 'short' }));
  const monthDay = parsed
    ? parsed.toLocaleDateString([], { month: 'short', day: 'numeric' })
    : firstText(day?.date, `Day ${day?.dayNumber || ''}`);
  const dayNumber = firstText(
    parsed?.toLocaleDateString([], { day: 'numeric' }),
    day?.dayNumber,
  );
  return { weekday, monthDay, dayNumber };
}

function renderTimeline() {
  const days = asArray(itinerary?.days);
  selectedDayIndex = days.length
    ? Math.min(Math.max(0, selectedDayIndex), days.length - 1)
    : 0;
  elements.scrubber.min = '0';
  elements.scrubber.max = String(Math.max(0, days.length - 1));
  elements.scrubber.value = String(selectedDayIndex);
  elements.dateTrack.replaceChildren();

  days.forEach((day, index) => {
    const parts = dateParts(day);
    const listItem = createElement('li');
    const button = createElement('button');
    button.type = 'button';
    button.dataset.dayIndex = String(index);
    button.dataset.dayId = day.id || String(index);
    button.dataset.state = day.state || 'working';
    button.dataset.focusKey = `day-${day.id || index}`;
    button.tabIndex = index === selectedDayIndex ? 0 : -1;
    button.classList.toggle('is-active', index === selectedDayIndex);
    const currentDayIndex = days.findIndex((candidate) => candidate.date === todayInIceland());
    const confirmedDayIndex = days.findIndex((candidate) => candidate.id === itinerary?.trip?.currentState?.dayId);
    const isCurrentTripDay = index === currentDayIndex;
    const isLatestConfirmedDay = index === confirmedDayIndex;
    const isEarlierTripDay = currentDayIndex >= 0 && index < currentDayIndex;
    button.classList.toggle('is-current-trip-day', isCurrentTripDay);
    button.classList.toggle('is-latest-confirmed-day', isLatestConfirmedDay);
    button.classList.toggle('is-earlier-trip-day', isEarlierTripDay);
    button.setAttribute('aria-current', isCurrentTripDay ? 'date' : 'false');
    button.setAttribute('aria-pressed', String(index === selectedDayIndex));
    button.setAttribute(
      'aria-label',
      `${parts.weekday}, ${parts.monthDay}: ${day.title}. ${statusLabel(day.state)}.${isCurrentTripDay ? ' Today in Iceland.' : (isEarlierTripDay ? ' Earlier trip day; optional stops are not assumed completed.' : '')}${isLatestConfirmedDay ? ' Latest traveller-confirmed location update.' : ''}`,
    );
    button.append(
      createElement('strong', null, parts.dayNumber),
      createElement('small', null, parts.weekday),
    );
    listItem.append(button);
    elements.dateTrack.append(listItem);
  });

  const day = selectedDay();
  if (!day) {
    elements.timelineLive.textContent = 'No dated route is available.';
    elements.scrubber.setAttribute('aria-valuetext', 'No dated route');
    return;
  }
  const parts = dateParts(day);
  const message = `Day ${selectedDayIndex + 1} of ${days.length} · ${parts.weekday}, ${parts.monthDay} · ${day.title}`;
  elements.timelineLive.textContent = message;
  elements.scrubber.setAttribute('aria-valuetext', message);
}

function formatMinutes(value) {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(Number(value))) return '—';
  const minutes = Math.max(0, Math.round(Number(value)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function addDefinition(parent, label, value) {
  const wrap = createElement('div');
  wrap.append(createElement('dt', null, label), createElement('dd', null, value || '—'));
  parent.append(wrap);
}

function renderDayRail() {
  const day = selectedDay();
  elements.stopList.replaceChildren();
  elements.driveReadout.replaceChildren();
  if (!day) {
    elements.dayDate.textContent = 'No dated route';
    elements.dayTitle.textContent = 'Route unavailable';
    elements.dayState.textContent = 'Open';
    elements.daySummary.textContent = '';
    elements.orderCheck.hidden = true;
    return;
  }

  const parts = dateParts(day);
  const days = asArray(itinerary?.days);
  const currentDayIndex = days.findIndex((candidate) => candidate.date === todayInIceland());
  const confirmedDayIndex = days.findIndex((candidate) => candidate.id === itinerary?.trip?.currentState?.dayId);
  const thisDayIndex = days.findIndex((candidate) => candidate.id === day.id);
  const dayPhase = currentDayIndex >= 0 && thisDayIndex === currentDayIndex
    ? 'Today · '
    : (confirmedDayIndex >= 0 && thisDayIndex === confirmedDayIndex
      ? 'Last confirmed · '
      : (currentDayIndex >= 0 && thisDayIndex < currentDayIndex ? 'Earlier day · ' : ''));
  elements.dayDate.textContent = `${parts.weekday} · ${parts.monthDay}`;
  elements.dayTitle.textContent = day.title;
  elements.dayState.textContent = `${dayPhase}${statusLabel(day.state)}`;
  elements.dayState.dataset.state = day.state || 'working';
  elements.daySummary.textContent = firstText(day.summary);

  const route = day.route || {};
  addDefinition(
    elements.driveReadout,
    'Road distance',
    Number.isFinite(Number(route.distanceKm)) ? `${Math.round(Number(route.distanceKm))} km` : firstText(route.distance),
  );
  addDefinition(elements.driveReadout, 'Base drive', formatMinutes(route.baseMinutes));
  addDefinition(elements.driveReadout, 'Camper plan', formatMinutes(route.camperMinutes));
  addDefinition(elements.driveReadout, 'Sleep', firstText(day.overnight, 'Open'));
  if (route.confidence) addDefinition(elements.driveReadout, 'Confidence', humanize(route.confidence));
  if (route.note) addDefinition(elements.driveReadout, 'Drive note', route.note);

  const order = day.orderCheck;
  const orderText = typeof order === 'string'
    ? order
    : firstText(order?.note, order?.body, order?.message, order?.detail);
  const orderLabel = typeof order === 'object'
    ? firstText(order?.label, order?.status, 'Order check')
    : 'Order check';
  elements.orderCheck.hidden = !orderText;
  elements.orderCheck.querySelector('strong').textContent = orderLabel;
  elements.orderCheck.querySelector('p').textContent = orderText;

  const stopIds = asArray(day.stopIds);
  stopIds.forEach((optionId) => {
    const option = optionById(optionId);
    if (!option) return;
    const item = createElement('li');
    const button = createElement('button');
    button.type = 'button';
    button.dataset.optionId = option.id;
    button.dataset.action = 'select-stop';
    button.dataset.focusKey = `stop-${day.id}-${option.id}`;
    button.classList.toggle('is-active', option.id === selectedOptionId);
    button.setAttribute('aria-pressed', String(option.id === selectedOptionId));
    button.append(
      createElement('strong', null, option.shortTitle || option.title),
      createElement(
        'small',
        null,
        `${statusLabel(option.status)}${option.standout ? ' · ★ Best-of-area signal' : ''}`,
      ),
    );
    item.append(button);
    elements.stopList.append(item);
  });

  if (!elements.stopList.childElementCount) {
    const item = createElement('li');
    item.append(createElement('small', null, 'No mapped stops on this day; keep it available as route slack.'));
    elements.stopList.append(item);
  }
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function coordinateRings(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (value.length && value.every(isCoordinate)) return [value];
    return value.flatMap(coordinateRings);
  }
  if (typeof value === 'object') {
    return coordinateRings(
      value.points
      || value.coordinates
      || value.boundary
      || value.polygon
      || value.geometry,
    );
  }
  return [];
}

function mapCoordinate(option) {
  const map = option?.map;
  if (!map) return null;
  if (Number.isFinite(Number(map.lng)) && Number.isFinite(Number(map.lat))) {
    return [Number(map.lng), Number(map.lat)];
  }
  if (isCoordinate(map.coordinates)) return [Number(map.coordinates[0]), Number(map.coordinates[1])];
  return null;
}

function resolvedBounds() {
  const supplied = mapData?.bounds || {};
  const suppliedValues = [supplied.minLng, supplied.maxLng, supplied.minLat, supplied.maxLat].map(Number);
  if (suppliedValues.every(Number.isFinite)
      && suppliedValues[1] > suppliedValues[0]
      && suppliedValues[3] > suppliedValues[2]) {
    return {
      minLng: suppliedValues[0],
      maxLng: suppliedValues[1],
      minLat: suppliedValues[2],
      maxLat: suppliedValues[3],
    };
  }
  const coordinates = [
    ...coordinateRings(mapData?.boundary).flat(),
    ...asArray(mapData?.routes).flatMap((route) => asArray(route.points)),
    ...allMapPlaces().map(mapCoordinate).filter(Boolean),
  ].filter(isCoordinate);
  if (!coordinates.length) return { minLng: -25, maxLng: -13, minLat: 63, maxLat: 67 };
  const lngs = coordinates.map((point) => Number(point[0]));
  const lats = coordinates.map((point) => Number(point[1]));
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

function projectCoordinate(coordinate) {
  const bounds = resolvedBounds();
  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  const x = 55 + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 890;
  const y = 45 + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 610;
  return { x, y };
}

function linePath(points, close = false) {
  const projected = points.filter(isCoordinate).map(projectCoordinate);
  if (!projected.length) return '';
  const path = projected
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  return close ? `${path} Z` : path;
}

function renderGeometry(parent, geometry, className) {
  coordinateRings(geometry).forEach((ring) => {
    const pathData = linePath(ring, true);
    if (!pathData) return;
    parent.append(createSvgElement('path', {
      class: className,
      d: pathData,
      'fill-rule': 'evenodd',
    }));
  });
}

function markerMatchesFilter(option) {
  if (isBonusStore(option)) return bonusLayerEnabled;
  if (isCampingCardSite(option)) {
    return campingCardLayerEnabled && campingCardSiteMatchesScope(option);
  }
  if (activeMapFilter === 'all') return true;
  if (activeMapFilter === 'locked') return lockedStatuses.has(option.status);
  if (activeMapFilter === 'standout') return Boolean(option.standout);
  if (activeMapFilter === 'open') return openStatuses.has(option.status);
  return true;
}

function dedupeRoutePoints(points) {
  const result = [];
  points.forEach((coordinate) => {
    if (!isCoordinate(coordinate)) return;
    const point = projectCoordinate(coordinate);
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5) result.push(point);
  });
  return result;
}

function buildProjectedRoute() {
  const mainRoutes = asArray(mapData?.routes).filter((route) => route.state !== 'branch');
  const fromRoutes = dedupeRoutePoints(mainRoutes.flatMap((route) => asArray(route.points)));
  if (fromRoutes.length > 1) return fromRoutes;
  const fromStops = asArray(itinerary?.days).flatMap((day) => (
    asArray(day.stopIds)
      .map((optionId) => mapCoordinate(optionById(optionId)))
      .filter(Boolean)
  ));
  return dedupeRoutePoints(fromStops);
}

function progressForDay(day) {
  const geometryProgress = Number(mapData?.dayProgress?.[day?.id]);
  const raw = Number.isFinite(geometryProgress) ? geometryProgress : day?.progress;
  let value = raw;
  if (Array.isArray(raw)) value = raw[raw.length - 1];
  if (raw && typeof raw === 'object') {
    value = raw.end ?? raw.fraction ?? raw.overall ?? raw.route ?? raw.value;
  }
  value = Number(value);
  if (!Number.isFinite(value)) {
    const days = asArray(itinerary?.days);
    return days.length > 1 ? selectedDayIndex / (days.length - 1) : 0;
  }
  if (value > 1) value /= 100;
  return Math.min(1, Math.max(0, value));
}

function pointAlongRoute(progress) {
  if (!projectedRoute.length) return { x: 500, y: 350, angle: 0 };
  if (projectedRoute.length === 1) return { ...projectedRoute[0], angle: 0 };
  const lengths = [];
  let total = 0;
  for (let index = 1; index < projectedRoute.length; index += 1) {
    const previous = projectedRoute[index - 1];
    const current = projectedRoute[index];
    const length = Math.hypot(current.x - previous.x, current.y - previous.y);
    lengths.push(length);
    total += length;
  }
  let remaining = Math.min(1, Math.max(0, progress)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const start = projectedRoute[index];
      const end = projectedRoute[index + 1];
      const fraction = lengths[index] ? remaining / lengths[index] : 0;
      return {
        x: start.x + ((end.x - start.x) * fraction),
        y: start.y + ((end.y - start.y) * fraction),
        angle: Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI),
      };
    }
    remaining -= lengths[index];
  }
  return { ...projectedRoute[projectedRoute.length - 1], angle: 0 };
}

function createCamper(className, label) {
  const group = createSvgElement('g', {
    class: `camper ${className}`,
    role: 'img',
    'aria-label': label,
  });
  group.append(
    createSvgElement('rect', { class: 'camper__body', x: -16, y: -9, width: 32, height: 17, rx: 4 }),
    createSvgElement('rect', { class: 'camper__window', x: 4, y: -6, width: 8, height: 7, rx: 1 }),
    createSvgElement('rect', { class: 'camper__window', x: -11, y: -6, width: 10, height: 7, rx: 1 }),
    createSvgElement('circle', { class: 'camper__wheel', cx: -9, cy: 9, r: 3 }),
    createSvgElement('circle', { class: 'camper__wheel', cx: 10, cy: 9, r: 3 }),
  );
  return group;
}

function positionCampers(progress) {
  camperNodes.forEach((camper, index) => {
    const point = pointAlongRoute(progress);
    const radians = (point.angle * Math.PI) / 180;
    const separation = index ? 7 : -7;
    const offsetX = -Math.sin(radians) * separation;
    const offsetY = Math.cos(radians) * separation;
    camper.setAttribute(
      'transform',
      `translate(${(point.x + offsetX).toFixed(2)} ${(point.y + offsetY).toFixed(2)}) rotate(${point.angle.toFixed(2)})`,
    );
  });
}

function animateCampersTo(target, animate) {
  if (camperAnimation) cancelAnimationFrame(camperAnimation);
  const destination = Math.min(1, Math.max(0, target));
  if (camperProgress === null || !animate || reducedMotion.matches) {
    camperProgress = destination;
    positionCampers(destination);
    return;
  }
  const start = camperProgress;
  const startedAt = performance.now();
  const duration = 680;
  const tick = (now) => {
    const elapsed = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - ((1 - elapsed) ** 3);
    camperProgress = start + ((destination - start) * eased);
    positionCampers(camperProgress);
    if (elapsed < 1) camperAnimation = requestAnimationFrame(tick);
    else camperAnimation = null;
  };
  camperAnimation = requestAnimationFrame(tick);
}

function applyZoom() {
  elements.mapViewport.style.transform = `scale(${mapZoom})`;
  elements.zoomOut.disabled = mapZoom <= 1;
  elements.zoomIn.disabled = mapZoom >= 1.8;
  elements.zoomReset.disabled = mapZoom === 1;
}

function renderMapAttribution() {
  const attribution = asArray(mapData?.attribution);
  if (!attribution.length) return;
  elements.mapAttribution.replaceChildren(document.createTextNode('Route snapshot: '));
  attribution.forEach((source, index) => {
    if (index) elements.mapAttribution.append(document.createTextNode(' · '));
    const label = [source.name, source.license].filter(Boolean).join(' · ') || 'Map source';
    if (!appendSafeLink(elements.mapAttribution, { url: source.url, label })) {
      elements.mapAttribution.append(document.createTextNode(label));
    }
  });
  const snapshotDate = firstText(attribution.find((source) => source.snapshotDate)?.snapshotDate);
  if (snapshotDate) elements.mapAttribution.append(document.createTextNode(` · snapshot ${snapshotDate}`));
}

function routesForSelectedDay() {
  const day = selectedDay();
  if (!day) return [];
  const matching = asArray(mapData?.routes).filter((route) => asArray(route.dayIds).includes(day.id));
  if (matching.length) return matching.map((route) => ({
    state: ['locked', 'working', 'conditional', 'historical', 'branch'].includes(route.state)
      ? route.state
      : 'working',
    points: asArray(route.points),
  }));
  const fallback = asArray(day.stopIds)
    .map((optionId) => mapCoordinate(optionById(optionId)))
    .filter(Boolean);
  return fallback.length > 1 ? [{ state: 'working', points: fallback }] : [];
}

function renderMap(animateCampers = false) {
  if (camperAnimation) cancelAnimationFrame(camperAnimation);
  closeMapChoiceMenu({ restoreFocus: false });
  elements.mapViewport.replaceChildren();

  const landLayer = createSvgElement('g', { 'aria-hidden': 'true' });
  renderGeometry(landLayer, mapData?.boundary, 'map-land');
  renderGeometry(landLayer, mapData?.glaciers, 'map-glacier');
  elements.mapViewport.append(landLayer);

  const routeLayer = createSvgElement('g', { 'aria-hidden': 'true' });
  asArray(mapData?.routes).forEach((route) => {
    const state = ['locked', 'working', 'conditional', 'historical', 'branch'].includes(route.state)
      ? route.state
      : 'working';
    const pathData = linePath(asArray(route.points));
    if (!pathData) return;
    routeLayer.append(createSvgElement('path', {
      class: `route-path route-path--${state}`,
      d: pathData,
      'data-route-id': route.id || '',
    }));
  });
  elements.mapViewport.append(routeLayer);

  const highlightLayer = createSvgElement('g', { 'aria-hidden': 'true' });
  routesForSelectedDay().forEach((route) => {
    const pathData = linePath(route.points);
    if (pathData) highlightLayer.append(createSvgElement('path', {
      class: `route-day-highlight route-day-highlight--${route.state}`,
      d: pathData,
      'data-route-state': route.state,
    }));
  });
  elements.mapViewport.append(highlightLayer);

  const markerLayer = createSvgElement('g');
  const markerTouchRadius = requiredMarkerTouchRadius();
  allMapPlaces().filter((option) => mapCoordinate(option)).forEach((option) => {
    const point = projectCoordinate(mapCoordinate(option));
    const visible = markerMatchesFilter(option);
    const status = String(option.status || 'working').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const grocery = isBonusStore(option);
    const passSite = isCampingCardSite(option);
    const currentPlace = option.id === itinerary?.trip?.currentState?.currentPlaceId;
    const marker = createSvgElement('g', {
      class: [
        'map-marker',
        grocery ? 'map-marker--bonus' : '',
        passSite ? 'map-marker--camping-card' : '',
        status ? `map-marker--${status}` : '',
        option.standout ? 'map-marker--standout' : '',
        optionDayIds(option).includes(selectedDay()?.id) ? 'is-current-day' : '',
        currentPlace ? 'is-current-trip-place' : '',
        option.id === selectedOptionId ? 'is-active' : '',
        visible ? '' : ((grocery || passSite) ? 'is-layer-hidden' : 'is-muted'),
      ].filter(Boolean).join(' '),
      transform: `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`,
      role: 'button',
      tabindex: visible ? '0' : '-1',
      'aria-label': grocery
        ? `${option.name}. Bónus grocery, ${option.routeFit === 'on-route' ? 'on route' : 'short provisioning detour'}. ${option.address}.`
        : (passSite
          ? `${option.name}. Participating site in the prepaid Camping Card program; tax and extras may still cost. ${option.routeFit === 'direct' ? 'Directly useful on the remaining plan' : (option.routeFit === 'conditional' ? 'Conditional remaining-route alternative' : 'Outside the remaining route')}. ${option.address || humanize(option.region || '')}.`
          : `${option.title}. ${statusLabel(option.status)}${option.standout ? '. Best-of-area research signal' : ''}${currentPlace ? `. Last confirmed: ${firstText(itinerary?.trip?.currentState?.label, statusLabel(itinerary?.trip?.currentState?.status))}` : ''}.`),
      'aria-pressed': String(option.id === selectedOptionId),
      'aria-hidden': visible ? 'false' : 'true',
      'data-option-id': option.id,
      'data-action': 'select-marker',
      'data-focus-key': `marker-${option.id}`,
    });
    marker.append(
      createSvgElement('circle', {
        class: 'map-marker__touch',
        r: markerTouchRadius,
        'aria-hidden': 'true',
      }),
      createSvgElement('circle', { class: 'map-marker__halo', r: 15 }),
      grocery
        ? createSvgElement('rect', { class: 'map-marker__store', x: -7, y: -7, width: 14, height: 14, rx: 3 })
        : (passSite
          ? createSvgElement('path', { class: 'map-marker__camp', d: 'M0 -10 L10 0 L0 10 L-10 0 Z' })
          : createSvgElement('circle', { class: 'map-marker__dot', r: 6 })),
    );
    const offsets = option.map?.labelOffset;
    const offsetX = Array.isArray(offsets) ? offsets[0] : offsets?.x;
    const offsetY = Array.isArray(offsets) ? offsets[1] : offsets?.y;
    const label = createSvgElement('text', {
      class: 'map-marker__label',
      x: Number.isFinite(Number(offsetX)) ? Number(offsetX) : 14,
      y: Number.isFinite(Number(offsetY)) ? Number(offsetY) : -11,
    });
    label.textContent = firstText(option.map?.label, option.shortTitle, option.title, option.name);
    marker.append(label);
    markerLayer.append(marker);
  });
  elements.mapViewport.append(markerLayer);

  projectedRoute = buildProjectedRoute();
  const camperLayer = createSvgElement('g');
  camperNodes = [
    createCamper('camper--one', 'Camper one route position'),
    createCamper('camper--two', 'Camper two route position'),
  ];
  camperLayer.append(...camperNodes);
  elements.mapViewport.append(camperLayer);
  renderMapAttribution();
  applyZoom();
  if (camperProgress !== null) positionCampers(camperProgress);
  animateCampersTo(progressForDay(selectedDay()), animateCampers);
}

function requiredMarkerTouchRadius() {
  const box = elements.mapSvg.getBoundingClientRect();
  const viewBox = elements.mapSvg.viewBox?.baseVal;
  if (!viewBox?.width || !viewBox?.height || !box.width || !box.height) return 28;
  const renderedScale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
  return renderedScale > 0 ? Math.max(22, Math.ceil(22 / renderedScale)) : 28;
}

function resizeMarkerTouchTargets() {
  const radius = requiredMarkerTouchRadius();
  elements.mapViewport.querySelectorAll('.map-marker__touch')
    .forEach((target) => target.setAttribute('r', String(radius)));
}

function closeMapChoiceMenu({ restoreFocus = false } = {}) {
  if (mapChoiceMenu) mapChoiceMenu.remove();
  mapChoiceMenu = null;
  const returnTarget = mapChoiceReturnFocus;
  mapChoiceReturnFocus = null;
  if (restoreFocus && returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
}

function pointerChoices(event, fallbackMarker) {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)
      || (event.clientX === 0 && event.clientY === 0)) return [fallbackMarker];
  const matches = [...elements.mapViewport.querySelectorAll('.map-marker[aria-hidden="false"]')]
    .filter((marker) => {
      const target = marker.querySelector('.map-marker__touch');
      const box = target?.getBoundingClientRect();
      if (!box?.width || !box?.height) return marker === fallbackMarker;
      const radiusX = box.width / 2;
      const radiusY = box.height / 2;
      const deltaX = (event.clientX - (box.left + radiusX)) / radiusX;
      const deltaY = (event.clientY - (box.top + radiusY)) / radiusY;
      return (deltaX ** 2) + (deltaY ** 2) <= 1.01;
    });
  if (!matches.includes(fallbackMarker)) matches.push(fallbackMarker);
  const order = new Map(allMapPlaces().map((option, index) => [option.id, index]));
  return [...new Map(matches.map((marker) => [marker.dataset.optionId, marker])).values()]
    .sort((left, right) => (
      (order.get(left.dataset.optionId) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.dataset.optionId) ?? Number.MAX_SAFE_INTEGER)
    ));
}

function openMapChoiceMenu(markers, returnFocus) {
  closeMapChoiceMenu({ restoreFocus: false });
  mapChoiceReturnFocus = returnFocus;
  const menu = createElement('section', 'map-choice-menu');
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'false');
  const heading = createElement('h3', null, 'Choose this map area');
  heading.id = 'map-choice-menu-title';
  menu.setAttribute('aria-labelledby', heading.id);
  const close = createElement('button', 'map-choice-menu__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close map place chooser');
  close.addEventListener('click', () => closeMapChoiceMenu({ restoreFocus: true }));
  const header = createElement('div', 'map-choice-menu__head');
  header.append(heading, close);
  menu.append(
    header,
    createElement('p', 'map-choice-menu__intro', 'Several place targets meet here. Choose the exact stop you mean.'),
  );
  const choices = createElement('div', 'map-choice-menu__choices');
  markers.forEach((marker) => {
    const option = placeById(marker.dataset.optionId);
    if (!option) return;
    const button = createElement('button', 'map-choice-menu__option');
    button.type = 'button';
    button.dataset.optionId = option.id;
    button.append(
      createElement('strong', null, firstText(option.shortTitle, option.title, option.name)),
      createElement('span', null, isBonusStore(option)
        ? `Bónus · ${option.routeFit === 'on-route' ? 'on route' : 'short detour'}`
        : (isCampingCardSite(option)
          ? `Camping Card · ${campingCardRouteFitLabel(option.routeFit)}`
          : statusLabel(option.status))),
    );
    button.addEventListener('click', () => {
      closeMapChoiceMenu({ restoreFocus: false });
      chooseOption(option.id, { focusPanel: true, syncDay: true });
    });
    choices.append(button);
  });
  menu.append(choices);
  elements.mapFrame.append(menu);
  mapChoiceMenu = menu;
  choices.querySelector('button')?.focus({ preventScroll: true });
}

function appendBadge(parent, text, modifier) {
  const badge = createElement('span', ['badge', modifier].filter(Boolean).join(' '), text);
  parent.append(badge);
  return badge;
}

function appendDetailList(parent, values, emptyText = '') {
  const items = asArray(values).map(itemText).filter(Boolean);
  if (!items.length) {
    if (emptyText) parent.append(createElement('p', null, emptyText));
    return;
  }
  const list = createElement('ul');
  items.forEach((item) => list.append(createElement('li', null, item)));
  parent.append(list);
}

function renderBonusStorePanel(store) {
  const head = createElement('header', 'place-head place-head--bonus');
  const meta = createElement('div', 'place-head__meta');
  appendBadge(meta, 'Bónus grocery', 'badge--bonus');
  appendBadge(
    meta,
    store.routeFit === 'on-route' ? 'On route' : 'Short detour',
    `badge--${store.routeFit}`,
  );
  const title = createElement('h3', null, store.name);
  title.id = 'place-title';
  head.append(
    meta,
    title,
    createElement('p', 'place-location', store.address),
    createElement('p', 'place-hook', store.routeRelation),
  );
  elements.placeContent.append(head);

  const metrics = createElement('div', 'metric-grid metric-grid--store');
  [
    ['Route fit', store.routeFit === 'on-route' ? 'On route' : 'Short detour'],
    ['Nearest segment', store.nearestSegment],
    ['Coordinates', `${Number(store.map.lat).toFixed(6)}, ${Number(store.map.lng).toFixed(6)}`],
  ].forEach(([label, value]) => {
    const metric = createElement('div');
    metric.append(createElement('span', null, label), createElement('strong', null, value));
    metrics.append(metric);
  });
  elements.placeContent.append(metrics);

  const sourceSection = createElement('section', 'detail-section');
  sourceSection.append(
    createElement('h4', null, 'Store source and directions'),
    createElement(
      'p',
      null,
      `Bónus official locator checked ${bonusData.sourceAccessed}. Store hours and availability can change; verify them at the current source.`,
    ),
  );
  const links = createElement('div', 'contact-links');
  appendSafeLink(links, {
    url: bonusData.officialInventory.url,
    label: 'Official Bónus locator ↗',
  });
  appendSafeLink(links, {
    url: `https://www.google.com/maps/dir/?api=1&destination=${store.map.lat},${store.map.lng}`,
    label: `Directions to ${store.name} ↗`,
  });
  sourceSection.append(links);
  elements.placeContent.append(sourceSection);

  const custody = createElement('section', 'detail-section');
  custody.append(
    createElement('h4', null, 'Data custody'),
    createElement(
      'p',
      null,
      `Official locator coordinate; ${store.minimumRouteOffsetKm.toFixed(2)} km minimum line proximity to the stored route geometry. This is an audit metric, not a claimed driving distance.`,
    ),
  );
  elements.placeContent.append(custody);
}

function campingCardRouteFitLabel(routeFit) {
  if (routeFit === 'direct') return 'Direct route fit';
  if (routeFit === 'conditional') return 'Useful alternative';
  return 'Outside remaining route';
}

function compactSeasonDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString([], { month: 'short', day: 'numeric' }) : firstText(value);
}

function formatIcelandPhone(value) {
  const raw = String(value || '').trim();
  const compact = raw.replace(/[^+\d]/g, '');
  const match = compact.match(/^\+354(\d{3})(\d{4})$/);
  return match ? `+354 ${match[1]} ${match[2]}` : raw;
}

function renderCampingCardSitePanel(site) {
  const head = createElement('header', 'place-head place-head--camping-card');
  const meta = createElement('div', 'place-head__meta');
  appendBadge(meta, 'Prepaid Camping Card', 'badge--camping-card');
  appendBadge(meta, campingCardRouteFitLabel(site.routeFit), `badge--camping-${site.routeFit}`);
  const title = createElement('h3', null, site.name);
  title.id = 'place-title';
  head.append(
    meta,
    title,
    createElement('p', 'place-location', firstText(site.address, site.region)),
    createElement('p', 'place-hook', firstText(site.routeRelation, site.coverageNote)),
  );
  elements.placeContent.append(head);

  const opening = site.season2026 || site.opening || site.openingDates || {};
  const opens = firstText(opening.opens, site.opens);
  const closes = firstText(opening.closes, site.closes);
  const metrics = createElement('div', 'metric-grid metric-grid--store');
  [
    ['Route fit', campingCardRouteFitLabel(site.routeFit)],
    ['Nearest day', firstText(site.nearestSegment, site.nearestDayId)],
    ['2026 season', opens || closes ? `${compactSeasonDate(opens) || 'Check opening'}–${compactSeasonDate(closes) || 'check closing'}` : 'Check official page'],
  ].forEach(([label, value]) => {
    const metric = createElement('div');
    metric.append(createElement('span', null, label), createElement('strong', null, value));
    metrics.append(metric);
  });
  elements.placeContent.append(metrics);

  const coverage = createElement('section', 'detail-section camping-card-coverage');
  coverage.append(
    createElement('h4', null, 'What our prepaid card means'),
    createElement(
      'p',
      null,
      'Two passes were ordered ahead of time for our two camper units. Each valid card covers one camping unit, so confirm that both cards are valid before relying on coverage. The 400 ISK nightly lodging tax is separate, and electricity, showers, laundry or other amenities can still cost extra.',
    ),
    createElement(
      'p',
      null,
      'Normal policy is to arrive and register without booking. The card does not guarantee space; call ahead when weather or demand could fill the site.',
    ),
  );
  const cardCaveats = asArray(site.cardCaveats).map(itemText).filter(Boolean);
  if (site.blackoutNote || site.coverageNote || cardCaveats.length) {
    const caveat = createElement('div', 'coverage-caveat');
    appendDetailList(caveat, [site.blackoutNote, site.coverageNote, ...cardCaveats].filter(Boolean));
    coverage.append(caveat);
  }
  elements.placeContent.append(coverage);

  if (asArray(site.amenities).length) {
    const amenitySection = createElement('section', 'detail-section');
    amenitySection.append(createElement('h4', null, 'Verified site services'));
    appendDetailList(amenitySection, asArray(site.amenities).map(humanize));
    amenitySection.append(createElement('p', 'detail-footnote', 'A listed service is not a promise that its fee is covered by the Camping Card.'));
    elements.placeContent.append(amenitySection);
  }

  const contact = createElement('section', 'detail-section');
  contact.append(
    createElement('h4', null, 'Official details and directions'),
    createElement(
      'p',
      null,
      `Official Camping Card inventory checked ${firstText(campingCardData?.sourceAccessedAt, campingCardData?.sourceAccessed, 'August 13, 2026')}. Recheck capacity and live site notices before changing a remaining overnight.`,
    ),
  );
  const links = createElement('div', 'contact-links');
  if (site.mapNote) contact.append(createElement('p', 'detail-footnote', site.mapNote));
  appendSafeLink(links, { url: site.officialUrl, label: `${site.name} official Camping Card page ↗` });
  appendSafeLink(links, {
    url: campingCardData?.officialInventory?.programUrl || campingCardData?.officialInventory?.url,
    label: 'Official 2026 Camping Card inventory ↗',
  });
  const faqSource = asArray(campingCardData?.provenance?.officialSnapshots)
    .find((source) => /faq/i.test(source.name));
  appendSafeLink(links, { url: faqSource?.url, label: 'Official coverage and arrival FAQ ↗' });
  const phones = asArray(site.phones).length ? site.phones : [site.phone].filter(Boolean);
  phones.forEach((phone) => appendSafeLink(links, {
    url: `tel:${String(phone).replace(/[^+\d]/g, '')}`,
    label: `Call ${formatIcelandPhone(phone)}`,
    protocols: ['tel:'],
  }));
  appendSafeLink(links, {
    url: `https://www.google.com/maps/dir/?api=1&destination=${site.map.lat},${site.map.lng}`,
    label: `Directions to ${site.name} ↗`,
  });
  contact.append(links);
  elements.placeContent.append(contact);
}

function renderPlacePanel() {
  const previousOptionId = renderedPanelOptionId;
  elements.placeContent.replaceChildren();
  const option = selectedOption();
  elements.placePanel.classList.toggle('is-closed', !panelOpen || !option);
  elements.plannerShell.classList.toggle('is-place-collapsed', !panelOpen || !option);
  elements.placePanel.setAttribute('aria-hidden', String(!panelOpen || !option));
  if ('inert' in elements.placePanel) elements.placePanel.inert = !panelOpen || !option;
  if (!option) {
    renderedPanelOptionId = null;
    return;
  }
  renderedPanelOptionId = option.id;
  if (previousOptionId !== option.id) elements.placePanel.scrollTop = 0;

  if (isBonusStore(option)) {
    renderBonusStorePanel(option);
    return;
  }
  if (isCampingCardSite(option)) {
    renderCampingCardSitePanel(option);
    return;
  }

  const head = createElement('header', 'place-head');
  const meta = createElement('div', 'place-head__meta');
  appendBadge(meta, statusLabel(option.status), `badge--${option.status || 'working'}`);
  const currentState = itinerary?.trip?.currentState;
  if (option.id === currentState?.currentPlaceId) {
    appendBadge(meta, `Last confirmed · ${humanize(currentState.status || 'update')}`, 'badge--current-trip');
  }
  const currentStayIsOutsidePass = option.id === currentState?.currentPlaceId
    && currentState?.currentPlaceIsCampingCardSite === false;
  if (currentStayIsOutsidePass) appendBadge(meta, 'Not a Camping Card site', 'badge--outside-pass');
  if (option.standout) appendBadge(meta, '★ Best-of-area signal', 'badge--standout');
  asArray(option.tags).slice(0, 3).forEach((tag) => appendBadge(meta, humanize(tag)));
  const title = createElement('h3', null, option.title);
  title.id = 'place-title';
  head.append(
    meta,
    title,
    createElement('p', 'place-location', firstText(option.location, option.legTitle)),
    createElement('p', 'place-hook', firstText(option.hook, option.summary, option.details)),
  );
  elements.placeContent.append(head);

  if (currentStayIsOutsidePass) {
    const section = createElement('section', 'detail-section current-stay-note');
    section.append(
      createElement('h4', null, 'Latest confirmed stay'),
      createElement(
        'p',
        null,
        `Traveller-confirmed update. ${option.title} is not in the official 30-site Camping Card roster, so the latest confirmed location is shown without claiming pass coverage.`,
      ),
    );
    elements.placeContent.append(section);
  }

  const visit = option.visit || {};
  const metrics = createElement('div', 'metric-grid');
  [
    ['Time', firstText(visit.duration, option.duration, 'Flexible')],
    ['Walk', firstText(visit.walk, 'See route note')],
    ['Difficulty', firstText(visit.difficulty, 'To check')],
  ].forEach(([label, value]) => {
    const metric = createElement('div');
    metric.append(createElement('span', null, label), createElement('strong', null, value));
    metrics.append(metric);
  });
  elements.placeContent.append(metrics);

  if (asArray(option.logistics).length) {
    const section = createElement('section', 'detail-section');
    section.append(createElement('h4', null, 'At a glance'));
    appendDetailList(section, option.logistics);
    elements.placeContent.append(section);
  }

  if (option.planningContext || option.documentStatus) {
    const section = createElement('section', 'detail-section');
    section.append(createElement('h4', null, 'Planning state'));
    if (option.documentStatus) {
      const documentState = createElement('p');
      documentState.append(
        createElement('strong', null, 'Source document: '),
        document.createTextNode(option.documentStatus),
      );
      section.append(documentState);
    }
    if (option.planningContext) section.append(createElement('p', null, option.planningContext));
    elements.placeContent.append(section);
  }

  const family = option.family || {};
  if (Object.keys(family).length) {
    const section = createElement('section', 'detail-section');
    section.append(createElement('h4', null, 'Family fit'));
    if (family.fit) section.append(createElement('p', null, family.fit));
    const details = [
      family.stroller ? `Stroller: ${family.stroller}` : '',
      family.carrier ? `Carrier: ${family.carrier}` : '',
      ...asArray(family.hazards).map((hazard) => `Hazard: ${itemText(hazard)}`),
    ].filter(Boolean);
    appendDetailList(section, details);
    if (family.notes) section.append(createElement('p', null, family.notes));
    elements.placeContent.append(section);
  }

  if (asArray(option.pros).length || asArray(option.drawbacks).length) {
    const section = createElement('section', 'detail-section detail-columns');
    const pros = createElement('div');
    pros.append(createElement('h5', null, 'Why it earns time'));
    appendDetailList(pros, option.pros, 'No specific upside recorded yet.');
    const drawbacks = createElement('div');
    drawbacks.append(createElement('h5', null, 'What could break it'));
    appendDetailList(drawbacks, option.drawbacks, 'No specific drawback recorded yet.');
    section.append(pros, drawbacks);
    elements.placeContent.append(section);
  }

  if (asArray(option.amenities).length) {
    const section = createElement('section', 'detail-section');
    section.append(createElement('h4', null, 'Amenities'));
    const list = createElement('ul', 'amenity-list');
    asArray(option.amenities).map(itemText).filter(Boolean)
      .forEach((amenity) => list.append(createElement('li', null, amenity)));
    section.append(list);
    elements.placeContent.append(section);
  }

  const booking = option.booking || {};
  if (Object.keys(booking).length) {
    const section = createElement('section', 'detail-section');
    section.append(createElement('h4', null, 'Booking and contact'));
    const required = typeof booking.required === 'boolean'
      ? (booking.required ? 'Advance booking required.' : 'No advance booking currently required.')
      : firstText(booking.required);
    if (required) section.append(createElement('p', null, required));
    if (booking.notes) section.append(createElement('p', null, booking.notes));
    const links = createElement('div', 'contact-links');
    appendSafeLink(links, {
      url: booking.url,
      label: firstText(booking.label, 'Official booking page ↗'),
    });
    if (booking.phone) {
      const dialable = String(booking.phone).replace(/[^+\d]/g, '');
      appendSafeLink(links, {
        url: `tel:${dialable}`,
        label: `Call ${booking.phone}`,
        protocols: ['tel:'],
      });
    }
    if (links.childElementCount) section.append(links);
    elements.placeContent.append(section);
  }

  if (asArray(option.sources).length) {
    const section = createElement('section', 'detail-section');
    const details = createElement('details');
    details.append(createElement('summary', null, `Evidence and source links · ${option.sources.length}`));
    const list = createElement('ul', 'source-list');
    asArray(option.sources).forEach((source) => {
      const item = createElement('li');
      const label = `${source.label || 'Source'}${source.type ? ` · ${source.type}` : ''} ↗`;
      if (appendSafeLink(item, { url: source.url, label })) list.append(item);
    });
    details.append(list);
    section.append(details);
    elements.placeContent.append(section);
  }
}

function renderMapStory() {
  elements.mapStoryContent.replaceChildren();
  const option = selectedOption();
  const media = option ? placeMediaByOption[option.id] : null;
  const reviewSignal = firstText(option?.reviewSignal);
  const experienceSource = asArray(option?.sources).find((source) => (
    experienceSourceTypes.has(String(source?.type || '').toLowerCase())
  ));
  const hasTravellerSignal = Boolean(reviewSignal || experienceSource);
  const visible = Boolean(storyOpen && option && (media || reviewSignal || experienceSource));

  elements.mapStory.classList.toggle('is-hidden', !visible);
  elements.mapStory.classList.toggle('has-media', Boolean(visible && media));
  elements.mapStory.setAttribute('aria-hidden', String(!visible));
  if ('inert' in elements.mapStory) elements.mapStory.inert = !visible;
  if (!visible) {
    delete elements.mapStory.dataset.optionId;
    return;
  }
  elements.mapStory.dataset.optionId = option.id;
  elements.closeMapStory.setAttribute(
    'aria-label',
    `Hide ${media && hasTravellerSignal ? 'planning image and traveller review' : (media ? 'planning image' : 'traveller review')} card`,
  );

  if (media) {
    const figure = createElement('figure', 'map-story-card__media');
    const image = createElement('img');
    image.src = media.src;
    image.alt = media.alt;
    image.width = 960;
    image.height = 600;
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(
      image,
      createElement('figcaption', null, 'Planning-document image · not a live conditions view.'),
    );
    elements.mapStoryContent.append(figure);
  }

  const body = createElement('div', 'map-story-card__body');
  body.append(createElement(
    'p',
    'map-story-card__eyebrow',
    media && hasTravellerSignal ? 'Planning image + traveller signal' : (media ? 'Planning image' : 'Traveller signal'),
  ));
  const title = createElement('h3', null, firstText(option.shortTitle, option.title));
  title.id = 'map-story-title';
  body.append(title);
  if (reviewSignal) {
    const review = createElement('p', 'map-story-card__review', reviewSignal);
    review.dataset.reviewSignal = '';
    body.append(review);
  }
  if (experienceSource) {
    const link = appendSafeLink(body, {
      url: experienceSource.url,
      label: `Read ${firstText(experienceSource.label, experienceSource.type, 'traveller source')} ↗`,
      className: 'map-story-card__source',
    });
    if (link) link.dataset.sourceType = String(experienceSource.type || '').toLowerCase();
  }
  elements.mapStoryContent.append(body);
}

function renderVoting() {
  elements.selectedVoting.replaceChildren();
  const option = selectedOption();
  if (!option) {
    elements.selectedVoting.append(createElement('p', 'empty-note', 'Choose a mapped place to weigh in.'));
    return;
  }
  if (isReferencePlace(option)) {
    elements.selectedVoting.append(createElement(
      'p',
      `empty-note ${isCampingCardSite(option) ? 'camping-card-reference-note' : 'grocery-reference-note'}`,
      isCampingCardSite(option)
        ? 'Prepaid campsite reference only. Camping Card markers do not accept votes or sticky notes and never write to shared trip state.'
        : 'Provisioning reference only. Grocery markers do not accept votes and never write to shared trip state.',
    ));
    return;
  }
  const panel = createElement('section', 'vote-panel');
  const title = createElement('p', 'vote-panel__title');
  title.id = `preference-title-${option.id}`;
  const participant = currentParticipant();
  title.append(
    createElement('strong', null, option.shortTitle || option.title),
    createElement('span', null, participant ? `${participantNames[participant]}’s ranking` : 'Choose your name'),
  );
  panel.append(title);

  const preferences = createElement('div', 'preference-grid');
  preferences.setAttribute('role', 'group');
  preferences.setAttribute('aria-labelledby', title.id);
  const preferencePending = pendingPreferenceOptions.has(option.id);
  preferences.dataset.optionId = option.id;
  preferences.setAttribute('aria-busy', String(preferencePending));
  const current = participant ? (votesFor(option.id)[participant] || 'undecided') : 'undecided';
  [
    ['love', 'Love it'],
    ['interested', 'Interested'],
    ['pass', 'Not for me'],
  ].forEach(([value, label]) => {
    const button = createElement('button', 'preference-button', label);
    button.type = 'button';
    button.dataset.action = 'preference';
    button.dataset.optionId = option.id;
    button.dataset.preference = value;
    button.dataset.focusKey = `preference-${option.id}-${value}`;
    button.classList.toggle('is-active', current === value);
    button.setAttribute('aria-pressed', String(current === value));
    button.setAttribute('aria-disabled', String(!sharedState.available || preferencePending));
    if (preferencePending) button.dataset.saving = 'true';
    button.disabled = !sharedState.available;
    preferences.append(button);
  });
  panel.append(preferences);

  const voterSummary = createElement('div', 'voter-summary');
  participantIds.forEach((id) => {
    const row = createElement('div');
    const value = votesFor(option.id)[id] || 'undecided';
    row.append(
      createElement('span', null, participantNames[id]),
      createElement('span', null, preferenceLabels[value] || humanize(value)),
    );
    voterSummary.append(row);
  });
  panel.append(voterSummary);
  const consensus = consensusFor(option.id);
  panel.append(createElement(
    'p',
    `group-signal${consensus.agreement ? ' group-signal--yes' : ''}`,
    consensusText(consensus),
  ));
  elements.selectedVoting.append(panel);
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderComments() {
  elements.selectedComments.replaceChildren();
  const option = selectedOption();
  if (!option) return;
  if (isReferencePlace(option)) return;
  const panel = createElement('section', 'comment-panel');
  panel.append(createElement('h4', null, 'Sticky notes'));
  const form = createElement('form', 'sticky-form');
  form.dataset.optionId = option.id;
  form.dataset.commentForm = '';
  const textarea = createElement('textarea');
  textarea.name = 'comment';
  textarea.maxLength = 600;
  textarea.required = true;
  textarea.placeholder = 'Add the practical reason behind your ranking…';
  textarea.value = commentDrafts.get(option.id) || '';
  textarea.dataset.focusKey = `comment-${option.id}`;
  textarea.setAttribute('aria-label', `Comment on ${option.title}`);
  const row = createElement('div', 'sticky-form__row');
  const count = createElement('span', 'character-count', `${textarea.value.length}/600`);
  count.dataset.commentCount = option.id;
  const button = createElement('button', 'mini-button', 'Pin note');
  button.type = 'submit';
  button.dataset.focusKey = `comment-submit-${option.id}`;
  button.disabled = !sharedState.available;
  row.append(count, button);
  form.append(textarea, row);
  panel.append(form);

  const comments = asArray(sharedState.comments).filter((comment) => comment.optionId === option.id);
  if (!comments.length) {
    panel.append(createElement('p', 'empty-note', 'No sticky notes yet. Add the first practical reason or question.'));
  } else {
    const list = createElement('ol', 'comment-list');
    comments.forEach((comment) => {
      const item = createElement('li', 'sticky-note');
      item.append(createElement('p', null, comment.text));
      const footer = createElement('footer');
      const timestamp = formatTimestamp(comment.createdAt);
      const time = createElement('time', null, timestamp);
      if (comment.createdAt) time.dateTime = comment.createdAt;
      footer.append(
        createElement('span', null, participantNames[comment.participant] || humanize(comment.participant)),
        time,
      );
      item.append(footer);
      list.append(item);
    });
    panel.append(list);
  }
  elements.selectedComments.append(panel);
}

function rankedOptions() {
  return allOptions()
    .map((option) => ({ option, consensus: consensusFor(option.id) }))
    .sort((left, right) => (
      right.consensus.score - left.consensus.score
      || right.consensus.decided - left.consensus.decided
      || Number(right.option.standout) - Number(left.option.standout)
      || left.option.title.localeCompare(right.option.title)
    ));
}

function renderAlignment() {
  const ranked = rankedOptions();
  const agreements = ranked.filter(({ consensus }) => consensus.agreement).length;
  elements.alignmentCount.textContent = String(agreements);
  elements.topAlignment.replaceChildren();
  const voted = ranked.filter(({ consensus }) => consensus.decided > 0);
  const shortlist = (voted.length ? voted : ranked.filter(({ option }) => option.standout)).slice(0, 6);
  shortlist.forEach(({ option, consensus }) => {
    const item = createElement('div', 'alignment-item');
    item.tabIndex = 0;
    item.role = 'button';
    item.dataset.optionId = option.id;
    item.dataset.action = 'select-alignment';
    item.dataset.focusKey = `alignment-${option.id}`;
    item.setAttribute('aria-label', `Open ${option.title}. ${consensusText(consensus)}.`);
    item.append(
      createElement('strong', null, option.shortTitle || option.title),
      createElement(
        'span',
        null,
        consensus.decided
          ? `${consensusText(consensus)} · ${consensus.score} pt`
          : `Research standout · ${option.legTitle || option.location}`,
      ),
    );
    elements.topAlignment.append(item);
  });
  if (!shortlist.length) elements.topAlignment.append(createElement('p', 'empty-note', 'Alignment appears after the first ranking.'));
}

function decisionBody(decision) {
  return firstText(
    decision?.body,
    decision?.summary,
    decision?.question,
    decision?.recommendation,
    decision?.whyItMatters,
    decision?.rationale,
    decision?.detail,
    decision?.why,
  );
}

function renderDecisionCards() {
  elements.decisionCards.replaceChildren();
  const decisions = asArray(itinerary?.decisions);
  const entries = decisions.map((decision, index) => ({ decision, index, suggestion: false }));
  asArray(sharedState.suggestions).forEach((suggestion, index) => {
    entries.push({
      decision: {
        id: `decision-${suggestion.id}`,
        optionId: suggestion.id,
        title: suggestion.title,
        body: suggestion.details,
        location: suggestion.location,
        status: consensusText(consensusFor(suggestion.id)),
      },
      index: decisions.length + index,
      suggestion: true,
    });
  });
  entries.forEach(({ decision, index, suggestion }) => {
    const card = createElement('article', 'decision-card');
    card.dataset.decisionId = decision.id || `decision-${index + 1}`;
    const relatedId = firstText(decision.optionId, asArray(decision.optionIds)[0]);
    if (relatedId && optionById(relatedId)) {
      card.tabIndex = 0;
      card.role = 'button';
      card.dataset.optionId = relatedId;
      card.dataset.action = 'select-decision';
      card.dataset.focusKey = `decision-${decision.id || relatedId}`;
      card.setAttribute('aria-label', `Open place details for ${decision.title}`);
    }
    card.append(
      createElement('span', 'decision-card__number', String(decision.number || index + 1).padStart(2, '0')),
      createElement('h3', null, firstText(decision.title, `Decision ${index + 1}`)),
      createElement('p', null, decisionBody(decision)),
    );
    [
      ['Recommendation', decision.recommendation],
      ['Why it matters', decision.whyItMatters],
      ['Next action', firstText(decision.nextAction, decision.impact, decision.dependency)],
    ].forEach(([label, value]) => {
      if (!value || value === decisionBody(decision)) return;
      const paragraph = createElement('p');
      paragraph.append(createElement('strong', null, `${label}: `), document.createTextNode(value));
      card.append(paragraph);
    });
    asArray(decision.sources).forEach((source) => {
      const paragraph = createElement('p');
      if (appendSafeLink(paragraph, {
        url: source.url,
        label: `${source.label || 'Decision source'} ↗`,
      })) card.append(paragraph);
    });
    const footer = createElement('footer');
    const state = firstText(decision.status, decision.state, suggestion ? 'Group suggestion' : 'Open');
    const priority = firstText(decision.priority);
    footer.append(
      createElement('span', null, firstText(decision.due, decision.deadline, decision.location, decision.dayLabel, decision.when, decision.dayId, 'Route-wide')),
      createElement('span', null, [state, priority].filter(Boolean).join(' · ')),
    );
    card.append(footer);
    elements.decisionCards.append(card);
  });
  if (!entries.length) {
    elements.decisionCards.append(createElement('p', 'empty-note', 'No route decisions are currently queued.'));
  }
}

function operationItems(operation) {
  return [
    ...asArray(operation.items),
    ...asArray(operation.details),
    ...asArray(operation.steps),
    ...asArray(operation.checks),
    ...asArray(operation.actions),
    ...asArray(operation.notes),
  ];
}

function renderOperations() {
  elements.opsGrid.replaceChildren();
  asArray(itinerary?.operations).forEach((operation, index) => {
    const card = createElement('article', 'ops-card');
    card.append(
      createElement('span', 'ops-card__icon', firstText(operation.icon, operation.symbol, String(index + 1).padStart(2, '0'))),
      createElement('h3', null, firstText(operation.title, operation.label, `Operations check ${index + 1}`)),
    );
    const body = firstText(operation.body, operation.summary, operation.description);
    if (body) card.append(createElement('p', null, body));
    const operationMeta = [
      firstText(operation.status),
      firstText(operation.when),
    ].filter(Boolean).join(' · ');
    if (operationMeta) card.append(createElement('p', null, operationMeta));
    const items = operationItems(operation);
    if (items.length) {
      const list = createElement('ul');
      items.forEach((item) => {
        const row = createElement('li');
        const text = itemText(item);
        const linked = typeof item === 'object' && appendSafeLink(row, {
          url: item.url,
          label: `${text || item.label || 'Operational source'} ↗`,
        });
        if (!linked) row.textContent = text;
        list.append(row);
      });
      card.append(list);
    }
    [...asArray(operation.links), ...asArray(operation.sources)].forEach((source) => {
      const paragraph = createElement('p');
      if (appendSafeLink(paragraph, {
        url: source.url,
        label: `${source.label || 'Official source'} ↗`,
      })) card.append(paragraph);
    });
    elements.opsGrid.append(card);
  });
  if (!elements.opsGrid.childElementCount) {
    elements.opsGrid.append(createElement('p', 'empty-note', 'Operational checks will appear here when route data is available.'));
  }
}

function renderMethodValue(parent, key, value) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== undefined && item !== null);
    if (!items.length) return;
    const heading = createElement('p');
    heading.append(createElement('strong', null, `${humanize(key)}:`));
    parent.append(heading);
    const list = createElement('ul', 'source-list');
    items.forEach((item) => {
      const row = createElement('li');
      if (typeof item === 'object' && item.url) {
        appendSafeLink(row, {
          url: item.url,
          label: `${itemText(item) || item.label || 'Source'} ↗`,
        });
      } else {
        row.textContent = itemText(item);
      }
      list.append(row);
    });
    parent.append(list);
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => {
      renderMethodValue(parent, `${humanize(key)} · ${humanize(childKey)}`, childValue);
    });
    return;
  }
  const paragraph = createElement('p');
  paragraph.append(
    createElement('strong', null, `${humanize(key)}: `),
    document.createTextNode(String(value)),
  );
  parent.append(paragraph);
}

function renderMethodology() {
  elements.methodDetails.replaceChildren();
  const methodology = itinerary?.methodology;
  if (typeof methodology === 'string') {
    elements.methodDetails.append(createElement('p', null, methodology));
  } else if (methodology && typeof methodology === 'object') {
    Object.entries(methodology).forEach(([key, value]) => renderMethodValue(elements.methodDetails, key, value));
  }
  renderArchivedSourceDecisions(elements.methodDetails);
  if (!elements.methodDetails.childElementCount) {
    elements.methodDetails.append(createElement('p', null, 'No methodology note was supplied with this route snapshot.'));
  }
}

function renderArchivedSourceDecisions(parent) {
  const archived = asArray(itinerary?.archivedSourceDecisions);
  if (!archived.length) return;

  const section = createElement('section', 'archived-source-decisions');
  const heading = createElement('h3', null, 'Source history and route changes');
  heading.id = 'archived-source-decisions-title';
  section.setAttribute('aria-labelledby', heading.id);
  section.append(
    heading,
    createElement(
      'p',
      'archived-source-decisions__intro',
      'Read-only source history. Ruled-out and earlier-plan ideas stay preserved without masquerading as current stops; any existing shared state remains intact.',
    ),
  );

  const list = createElement('div', 'archived-source-decisions__list');
  archived.forEach((decision) => {
    const card = createElement('article', 'archived-source-decision');
    const statusText = decision?.status === 'ruled-out'
      ? 'Ruled out'
      : (decision?.status === 'removed-from-latest-plan' ? 'Removed from latest plan' : 'Earlier plan');
    const status = createElement('span', 'archived-source-decision__status', statusText);
    card.append(status, createElement('h4', null, firstText(decision?.title, 'Archived source decision')));
    if (decision?.documentStatus) card.append(createElement('p', null, decision.documentStatus));
    appendDetailList(card, decision?.items);

    const sourceList = createElement('ul', 'source-list archived-source-decision__sources');
    asArray(decision?.sources).forEach((source) => {
      const item = createElement('li');
      if (appendSafeLink(item, {
        url: source?.url,
        label: `${source?.label || 'Source record'} ↗`,
      })) sourceList.append(item);
    });
    if (sourceList.childElementCount) card.append(sourceList);
    list.append(card);
  });
  section.append(list);
  parent.append(section);
}

function renderIdeaLocations() {
  const current = elements.ideaLocation.value;
  elements.ideaLocation.replaceChildren();
  asArray(itinerary?.days).forEach((day) => {
    const parts = dateParts(day);
    const option = createElement('option', null, `${parts.monthDay} · ${day.title}`);
    option.value = firstText(day.title, day.id).slice(0, 70);
    elements.ideaLocation.append(option);
  });
  if (current && [...elements.ideaLocation.options].some((option) => option.value === current)) {
    elements.ideaLocation.value = current;
  }
}

function ensureSelection() {
  const days = asArray(itinerary?.days);
  if (days.length) selectedDayIndex = Math.min(Math.max(0, selectedDayIndex), days.length - 1);
  if (selectedOption()) return;
  const dayChoice = asArray(selectedDay()?.stopIds).find((id) => optionById(id));
  selectedOptionId = dayChoice || allOptions()[0]?.id || null;
}

function renderPage({ animateCampers = false, preserveFocus = true } = {}) {
  if (!itinerary) return;
  const snapshot = preserveFocus ? focusSnapshot() : null;
  ensureSelection();
  renderBaseline();
  renderCounts();
  renderReferenceLayerControls();
  renderTimeline();
  renderDayRail();
  renderMap(animateCampers);
  renderPlacePanel();
  renderMapStory();
  renderVoting();
  renderComments();
  renderAlignment();
  renderDecisionCards();
  renderOperations();
  renderMethodology();
  renderIdeaLocations();
  restoreFocus(snapshot);
}

function renderSharedState() {
  if (!itinerary) return;
  const snapshot = focusSnapshot();
  ensureSelection();
  renderCounts();
  renderVoting();
  renderComments();
  renderAlignment();
  renderDecisionCards();
  restoreFocus(snapshot);
}

function chooseDay(index, { animate = true, focusKey = null } = {}) {
  const days = asArray(itinerary?.days);
  if (!days.length) return;
  selectedDayIndex = Math.min(Math.max(0, Number(index) || 0), days.length - 1);
  const next = asArray(days[selectedDayIndex].stopIds).find((id) => optionById(id));
  if (next) selectedOptionId = next;
  panelOpen = true;
  storyOpen = true;
  renderPage({ animateCampers: animate, preserveFocus: false });
  const targetKey = focusKey || `day-${days[selectedDayIndex].id || selectedDayIndex}`;
  restoreFocus({ key: targetKey });
}

function scrollIntoViewImmediately(element, options) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  element.scrollIntoView({ ...options, behavior: 'auto' });
  root.style.scrollBehavior = previous;
}

function chooseOption(optionId, { focusPanel = false, syncDay = true } = {}) {
  const option = placeById(optionId);
  if (!option) return;
  selectedOptionId = option.id;
  if (syncDay) {
    const currentDayId = selectedDay()?.id;
    const dayIds = optionDayIds(option);
    if (dayIds.length && !dayIds.includes(currentDayId)) {
      const nextIndex = asArray(itinerary?.days).findIndex((day) => day.id === dayIds[0]);
      if (nextIndex >= 0) selectedDayIndex = nextIndex;
    }
  }
  panelOpen = true;
  storyOpen = true;
  renderPage({ animateCampers: true, preserveFocus: false });
  if (focusPanel) {
    if (window.matchMedia('(max-width: 820px)').matches) {
      scrollIntoViewImmediately(elements.placePanel, { block: 'start' });
      elements.placePanel.focus();
    } else {
      scrollIntoViewImmediately(elements.mapFrame, { block: 'start' });
      elements.placePanel.focus({ preventScroll: true });
    }
  }
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (${response.status}).`);
  }
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/iceland26/access.html?next=${encodeURIComponent(next)}`);
    throw new Error('Your trip session expired. Enter the shared code again.');
  }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function mutate(path, body) {
  setSync('saving', 'Saving your update…');
  try {
    const payload = await fetchJson(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const incoming = payload.state;
    if (incoming?.available
        && (!sharedState.available || Number(incoming.revision) > Number(sharedState.revision))) {
      sharedState = incoming;
      renderSharedState();
    }
    setSync('live', `Shared board live · revision ${sharedState.revision}`);
    return payload.result;
  } catch (error) {
    setSync('error', 'Update failed · nothing was changed');
    showToast(error.message, true);
    throw error;
  }
}

async function refreshState({ quiet = false } = {}) {
  try {
    const incoming = await fetchJson('/api/iceland26');
    if (incoming.available
        && (!sharedState.available || Number(incoming.revision) > Number(sharedState.revision))) {
      sharedState = incoming;
      renderSharedState();
    } else if (!incoming.available) {
      sharedState = {
        ...sharedState,
        available: false,
        error: incoming.error || 'Coordination updates are temporarily unavailable.',
      };
      renderSharedState();
    }
    if (incoming.available) {
      setSync('live', `Shared board live · revision ${sharedState.revision}`);
    } else {
      setSync('error', 'Board is temporarily read-only');
    }
  } catch (error) {
    setSync('error', 'Offline · showing the last loaded route');
    if (!quiet) showToast(error.message, true);
  } finally {
    document.dispatchEvent(new Event('iceland26:state-refresh-complete'));
  }
}

function fallbackMapData(tripData) {
  const points = asArray(tripData?.legs)
    .flatMap((leg) => asArray(leg.options))
    .map(mapCoordinate)
    .filter(Boolean);
  return {
    schemaVersion: 1,
    boundary: [],
    glaciers: [],
    routes: points.length > 1
      ? [{ id: 'route-fallback', dayIds: [], state: 'working', points }]
      : [],
  };
}

async function load() {
  const rememberedParticipant = readStorage('iceland26-participant');
  if (participantIds.includes(rememberedParticipant)) elements.participant.value = rememberedParticipant;

  const [tripResult, mapResult, bonusResult, campingCardResult, stateResult] = await Promise.allSettled([
    fetchJson('/iceland26/itinerary.json'),
    fetchJson('/iceland26/map-data.json'),
    fetchJson('/iceland26/bonus-stores.json'),
    fetchJson('/iceland26/camping-card-sites.json'),
    fetchJson('/api/iceland26'),
  ]);

  if (tripResult.status === 'rejected') {
    setSync('error', 'The dated route could not load');
    showToast(tripResult.reason.message, true);
    return;
  }

  itinerary = tripResult.value;
  mapData = mapResult.status === 'fulfilled' ? mapResult.value : fallbackMapData(itinerary);
  bonusData = bonusResult.status === 'fulfilled' ? bonusResult.value : {
    sourceAccessed: '',
    officialInventory: {},
    stores: [],
  };
  campingCardData = campingCardResult.status === 'fulfilled' ? campingCardResult.value : {
    sourceAccessed: '',
    officialInventory: {},
    sites: [],
  };
  if (stateResult.status === 'fulfilled') sharedState = stateResult.value;
  const currentDayIndex = asArray(itinerary.days)
    .findIndex((day) => day.id === itinerary?.trip?.currentState?.dayId);
  selectedDayIndex = Math.min(
    Math.max(0, currentDayIndex >= 0 ? currentDayIndex : (Number(elements.scrubber.value) || 0)),
    Math.max(0, asArray(itinerary.days).length - 1),
  );
  const currentPlaceId = itinerary?.trip?.currentState?.currentPlaceId;
  if (currentPlaceId && placeById(currentPlaceId)) selectedOptionId = currentPlaceId;
  ensureSelection();
  renderPage({ preserveFocus: false });

  if (stateResult.status === 'fulfilled' && sharedState.available) {
    setSync('live', `Shared board live · revision ${sharedState.revision}`);
  } else if (stateResult.status === 'rejected') {
    setSync('error', 'Offline · route loaded read-only');
    showToast(stateResult.reason.message, true);
  } else {
    setSync('error', 'Board is temporarily read-only');
  }
  if (mapResult.status === 'rejected') {
    showToast('The route geometry could not load; mapped stops are shown with a simplified fallback.', true);
  }
  if (bonusResult.status === 'rejected') {
    showToast('The Bónus provisioning layer could not load; the route board remains available.', true);
  }
  if (campingCardResult.status === 'rejected') {
    showToast('The prepaid Camping Card layer could not load; the dated route remains available.', true);
  }

  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshState({ quiet: true });
  }, 30_000);
}

elements.participant.addEventListener('change', () => {
  const participant = currentParticipant();
  writeStorage('iceland26-participant', participant);
  if (participant) showToast(`You’re weighing in as ${participantNames[participant]}.`);
  renderSharedState();
});

elements.scrubber.addEventListener('input', () => {
  chooseDay(Number(elements.scrubber.value), { animate: true, focusKey: null });
  elements.scrubber.focus({ preventScroll: true });
});

elements.dateTrack.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-day-index]');
  if (!button) return;
  chooseDay(Number(button.dataset.dayIndex), {
    animate: true,
    focusKey: button.dataset.focusKey,
  });
});

elements.dateTrack.addEventListener('keydown', (event) => {
  const button = event.target.closest('button[data-day-index]');
  if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const days = asArray(itinerary?.days);
  if (!days.length) return;
  let index = Number(button.dataset.dayIndex);
  if (event.key === 'ArrowLeft') index = Math.max(0, index - 1);
  if (event.key === 'ArrowRight') index = Math.min(days.length - 1, index + 1);
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = days.length - 1;
  event.preventDefault();
  chooseDay(index, { animate: true });
});

elements.stopList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-option-id]');
  if (!button) return;
  chooseOption(button.dataset.optionId, { focusPanel: true, syncDay: false });
});

function activateMapMarker(event, { offerPointerChoices = true } = {}) {
  const marker = event.target.closest('.map-marker[data-option-id]');
  if (!marker || marker.classList.contains('is-muted')) return;
  if (offerPointerChoices) {
    const choices = pointerChoices(event, marker);
    if (choices.length > 1) {
      openMapChoiceMenu(choices, marker);
      return;
    }
  }
  closeMapChoiceMenu({ restoreFocus: false });
  chooseOption(marker.dataset.optionId, { focusPanel: true, syncDay: true });
}

elements.mapSvg.addEventListener('click', activateMapMarker);
elements.mapSvg.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const marker = event.target.closest('.map-marker[data-option-id]');
  if (!marker) return;
  event.preventDefault();
  activateMapMarker(event, { offerPointerChoices: false });
});

elements.mapFilter.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-map-filter]');
  if (!button) return;
  activeMapFilter = button.dataset.mapFilter;
  elements.mapFilter.querySelectorAll('[data-map-filter]').forEach((candidate) => {
    const active = candidate.dataset.mapFilter === activeMapFilter;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-pressed', String(active));
  });
  renderMap(false);
  button.focus({ preventScroll: true });
});

elements.bonusLayer.addEventListener('click', () => {
  bonusLayerEnabled = !bonusLayerEnabled;
  elements.bonusLayer.classList.toggle('is-active', bonusLayerEnabled);
  elements.bonusLayer.setAttribute('aria-pressed', String(bonusLayerEnabled));
  if (!bonusLayerEnabled && isBonusStore(selectedOption())) {
    const dayChoice = asArray(selectedDay()?.stopIds).find((id) => optionById(id));
    selectedOptionId = dayChoice || allOptions()[0]?.id || null;
    panelOpen = true;
    storyOpen = true;
    renderPage({ animateCampers: false, preserveFocus: false });
  } else {
    renderMap(false);
  }
  elements.bonusLayer.focus({ preventScroll: true });
});

function selectCurrentDayFallback() {
  const dayChoice = asArray(selectedDay()?.stopIds).find((id) => optionById(id));
  selectedOptionId = dayChoice || allOptions()[0]?.id || null;
  panelOpen = true;
  storyOpen = true;
  renderPage({ animateCampers: false, preserveFocus: false });
}

elements.campingCardLayer.addEventListener('click', () => {
  campingCardLayerEnabled = !campingCardLayerEnabled;
  elements.campingCardLayer.classList.toggle('is-active', campingCardLayerEnabled);
  elements.campingCardLayer.setAttribute('aria-pressed', String(campingCardLayerEnabled));
  renderReferenceLayerControls();
  if (!campingCardLayerEnabled && isCampingCardSite(selectedOption())) {
    selectCurrentDayFallback();
  } else {
    renderMap(false);
  }
  elements.campingCardLayer.focus({ preventScroll: true });
});

elements.campingCardScope.addEventListener('change', () => {
  campingCardScope = ['direct', 'remaining', 'all'].includes(elements.campingCardScope.value)
    ? elements.campingCardScope.value
    : 'remaining';
  renderReferenceLayerControls();
  if (isCampingCardSite(selectedOption()) && !campingCardSiteMatchesScope(selectedOption())) {
    selectCurrentDayFallback();
  } else {
    renderMap(false);
  }
  elements.campingCardScope.focus({ preventScroll: true });
});

function changeZoom(next) {
  mapZoom = Math.min(1.8, Math.max(1, Math.round(next * 10) / 10));
  applyZoom();
}

elements.zoomOut.addEventListener('click', () => changeZoom(mapZoom - 0.2));
elements.zoomReset.addEventListener('click', () => changeZoom(1));
elements.zoomIn.addEventListener('click', () => changeZoom(mapZoom + 0.2));

function focusSelectedOptionTrigger() {
  const marker = [...elements.mapViewport.querySelectorAll('.map-marker[data-option-id]')]
    .find((candidate) => candidate.dataset.optionId === selectedOptionId && candidate.tabIndex === 0);
  const stop = [...elements.stopList.querySelectorAll('button[data-option-id]')]
    .find((candidate) => candidate.dataset.optionId === selectedOptionId);
  (marker || stop)?.focus({ preventScroll: true });
}

elements.closePlace.addEventListener('click', () => {
  panelOpen = false;
  storyOpen = false;
  renderPlacePanel();
  renderMapStory();
  focusSelectedOptionTrigger();
});

elements.closeMapStory.addEventListener('click', () => {
  storyOpen = false;
  renderMapStory();
  focusSelectedOptionTrigger();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements.ideaDialog.open) return;
  if (event.key === 'Escape' && mapChoiceMenu) {
    event.preventDefault();
    closeMapChoiceMenu({ restoreFocus: true });
    return;
  }
  if (event.key === 'Escape'
      && storyOpen
      && !elements.mapStory.classList.contains('is-hidden')
      && elements.mapStory.contains(document.activeElement)) {
    event.preventDefault();
    storyOpen = false;
    renderMapStory();
    focusSelectedOptionTrigger();
    return;
  }
  if (event.key === 'Escape' && panelOpen && !elements.ideaDialog.open) {
    panelOpen = false;
    storyOpen = false;
    renderPlacePanel();
    renderMapStory();
    focusSelectedOptionTrigger();
  }
});

elements.selectedVoting.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action="preference"]');
  if (!button
      || button.getAttribute('aria-disabled') === 'true'
      || pendingPreferenceOptions.has(button.dataset.optionId)) return;
  const participant = requireParticipant();
  if (!participant || !canWrite()) return;
  const optionId = button.dataset.optionId;
  const previous = votesFor(button.dataset.optionId)[participant];
  const preference = previous === button.dataset.preference ? 'undecided' : button.dataset.preference;
  // Keep the focused control focusable, but lock every ranking for this place
  // until its mutation finishes. This preserves focus while making rapid user
  // intent deterministic instead of request-arrival ordered.
  pendingPreferenceOptions.add(optionId);
  const preferenceGrid = button.closest('.preference-grid');
  preferenceGrid?.setAttribute('aria-busy', 'true');
  preferenceGrid?.querySelectorAll('button[data-action="preference"]').forEach((candidate) => {
    candidate.dataset.saving = 'true';
    candidate.setAttribute('aria-disabled', 'true');
  });
  try {
    await mutate('/api/iceland26/preference', {
      participant,
      optionId,
      preference,
    });
    showToast(preference === 'undecided' ? 'Preference cleared.' : 'Preference saved for the group.');
  } catch {
    // mutate already reports the failure; leave the prior preference intact.
  } finally {
    pendingPreferenceOptions.delete(optionId);
    if (selectedOptionId === optionId) {
      const snapshot = focusSnapshot();
      renderVoting();
      restoreFocus(snapshot);
    }
  }
});

elements.selectedComments.addEventListener('input', (event) => {
  const textarea = event.target.closest('textarea[name="comment"]');
  if (!textarea) return;
  const optionId = textarea.closest('form')?.dataset.optionId;
  if (!optionId) return;
  if (textarea.value) commentDrafts.set(optionId, textarea.value);
  else commentDrafts.delete(optionId);
  const count = elements.selectedComments.querySelector('[data-comment-count]');
  if (count) count.textContent = `${textarea.value.length}/600`;
});

elements.selectedComments.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-option-id]');
  if (!form) return;
  event.preventDefault();
  const participant = requireParticipant();
  if (!participant || !canWrite()) return;
  const textarea = form.elements.comment;
  const text = textarea.value.trim();
  if (!text) return;
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await mutate('/api/iceland26/comment', {
      participant,
      optionId: form.dataset.optionId,
      text,
    });
    if (commentDrafts.get(form.dataset.optionId)?.trim() === text) {
      commentDrafts.delete(form.dataset.optionId);
    }
    renderComments();
    showToast('Sticky note added to the discussion.');
  } catch {
    submit.disabled = false;
  }
});

function activateOptionCard(event) {
  if (event.target.closest('a, button')) return;
  const card = event.target.closest('[data-action^="select-"][data-option-id]');
  if (!card) return;
  chooseOption(card.dataset.optionId, { focusPanel: true, syncDay: true });
}

[elements.topAlignment, elements.decisionCards].forEach((container) => {
  container.addEventListener('click', activateOptionCard);
  container.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const card = event.target.closest('[data-action^="select-"][data-option-id]');
    if (!card) return;
    event.preventDefault();
    activateOptionCard(event);
  });
});

function openIdeaDialog() {
  if (!requireParticipant()) return;
  if (!canWrite()) return;
  if (typeof elements.ideaDialog.showModal === 'function') elements.ideaDialog.showModal();
  else elements.ideaDialog.setAttribute('open', '');
  elements.ideaForm.elements.title.focus();
}

function closeIdeaDialog() {
  if (typeof elements.ideaDialog.close === 'function' && elements.ideaDialog.open) elements.ideaDialog.close();
  else elements.ideaDialog.removeAttribute('open');
}

elements.openIdea.addEventListener('click', openIdeaDialog);
elements.closeIdea.addEventListener('click', closeIdeaDialog);
elements.cancelIdea.addEventListener('click', closeIdeaDialog);
elements.ideaDialog.addEventListener('click', (event) => {
  if (event.target === elements.ideaDialog) closeIdeaDialog();
});

elements.ideaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const participant = requireParticipant();
  if (!participant || !canWrite()) return;
  const formData = new FormData(elements.ideaForm);
  const submit = elements.ideaForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await mutate('/api/iceland26/suggestion', {
      participant,
      title: formData.get('title'),
      location: formData.get('location'),
      details: formData.get('details'),
    });
    elements.ideaForm.reset();
    closeIdeaDialog();
    selectedOptionId = result?.id || selectedOptionId;
    panelOpen = true;
    renderPage({ preserveFocus: false });
    elements.placePanel.focus({ preventScroll: true });
    showToast('Shared idea added. The group can weigh in now.');
  } catch {
    submit.disabled = false;
  }
});

elements.logout.addEventListener('click', async () => {
  elements.logout.disabled = true;
  try {
    const response = await fetch('/api/iceland26/logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Lock request failed (${response.status}).`);
    writeStorage('iceland26-participant', null);
    window.location.assign('/iceland26/access.html');
  } catch {
    elements.logout.disabled = false;
    showToast('The board could not be locked. You are still signed in; try again.', true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && itinerary) refreshState({ quiet: true });
});

window.addEventListener('resize', resizeMarkerTouchTargets, { passive: true });

window.addEventListener('beforeunload', () => {
  clearInterval(refreshTimer);
  if (camperAnimation) cancelAnimationFrame(camperAnimation);
});

load();
