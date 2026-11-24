/**
 * Cabinet Santé DZ — Appointment Booking Application
 * Dr. Mansouri · Batna City, Algeria
 *
 * Pure Vanilla JS + Supabase-Ready async dataService.
 */

// ============================================================================
// SUPABASE_CONFIG (Ready for Step 3 backend integration)
// ============================================================================
const SUPABASE_CONFIG = {
  enabled: false,
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',
  tables: {
    consultations: 'consultations',
    appointments: 'appointments',
  },
};

const STORAGE_KEY = 'cabinet_sante_dz_appointments_v1';

const CONSULTATION_TYPES = [
  {
    id: 'general',
    name: 'Consultation Générale',
    subtitle: 'General medical exam & prescription',
    feeDA: 1500,
    durationMin: 20,
    icon: 'stethoscope',
    defaultVisit: 'First Visit',
  },
  {
    id: 'followup',
    name: 'Suivi / Contrôle',
    subtitle: 'Results review & treatment adjustment',
    feeDA: 1000,
    durationMin: 20,
    icon: 'clipboard-check',
    defaultVisit: 'Follow-up',
  },
  {
    id: 'pediatrics',
    name: 'Pédiatrie',
    subtitle: 'Infant & child medical consultation',
    feeDA: 2000,
    durationMin: 20,
    icon: 'baby',
    defaultVisit: 'First Visit',
  },
  {
    id: 'certificate',
    name: 'Certificat Médical',
    subtitle: 'Aptitude, school, sport or work certificate',
    feeDA: 800,
    durationMin: 20,
    icon: 'file-check-2',
    defaultVisit: 'First Visit',
  },
];

// Fixed 20-minute slots
const MORNING_SLOTS = [
  '08:30', '08:50', '09:10', '09:30', '09:50',
  '10:10', '10:30', '10:50', '11:10', '11:30',
];

const AFTERNOON_SLOTS = [
  '13:30', '13:50', '14:10', '14:30', '14:50',
  '15:10', '15:30', '15:50', '16:10', '16:30',
];

// ============================================================================
// Date & Formatting Utilities
// ============================================================================

function toLocalISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isFriday(dateStr) {
  return parseISODate(dateStr).getDay() === 5;
}

function isPastDate(dateStr) {
  const todayStr = toLocalISODate(new Date());
  return dateStr < todayStr;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function addMinutesToTime(hhmm, mins) {
  const total = timeToMinutes(hhmm) + mins;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function isSlotPastForDate(dateStr, slotTime) {
  const now = new Date();
  const todayStr = toLocalISODate(now);
  if (dateStr < todayStr) return true;
  if (dateStr > todayStr) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return timeToMinutes(slotTime) <= nowMinutes;
}

function formatDateReadable(dateStr) {
  if (!dateStr) return '—';
  const d = parseISODate(dateStr);
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDA(amount) {
  return `${Number(amount).toLocaleString('en-US')} DA`;
}

function normalizePhone(raw) {
  return String(raw || '').replace(/[\s\-().]/g, '');
}

function isValidAlgerianMobile(raw) {
  const digits = normalizePhone(raw);
  return /^0[567]\d{8}$/.test(digits);
}

function formatPhoneDisplay(digits) {
  const clean = normalizePhone(digits);
  if (clean.length !== 10) return clean;
  return `${clean.slice(0, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8, 10)}`;
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getUpcomingOpenDates(count = 5) {
  const results = [];
  const cursor = new Date();
  const todayStr = toLocalISODate(cursor);

  // If today has no remaining open slots, start quick-picks from tomorrow
  // while still keeping today selectable in the date input if needed.
  const allSlotsToday = [...MORNING_SLOTS, ...AFTERNOON_SLOTS];
  const hasRemainingToday =
    !isFriday(todayStr) &&
    allSlotsToday.some((slot) => !isSlotPastForDate(todayStr, slot));

  if (!hasRemainingToday) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (results.length < count) {
    const iso = toLocalISODate(cursor);
    if (!isFriday(iso)) {
      results.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

// ============================================================================
// Async Data Service (localStorage now, Supabase-ready interface)
// ============================================================================

function readLocalAppointments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedInitialAppointments();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read appointments:', err);
    return [];
  }
}

function writeLocalAppointments(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function seedInitialAppointments() {
  const upcoming = getUpcomingOpenDates(2);
  const firstOpenDay = upcoming[0];
  return [
    {
      refCode: 'RDV-512',
      consultationId: 'general',
      consultationName: 'Consultation Générale',
      feeDA: 1500,
      date: firstOpenDay,
      time: '09:30',
      visitType: 'First Visit',
      patientName: 'Yacine Khelifi',
      patientAge: 34,
      patientPhone: '0550123456',
      note: 'Fièvre et fatigue depuis 2 jours',
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    },
    {
      refCode: 'RDV-518',
      consultationId: 'pediatrics',
      consultationName: 'Pédiatrie',
      feeDA: 2000,
      date: firstOpenDay,
      time: '14:30',
      visitType: 'Follow-up',
      patientName: 'Lina Bouzid',
      patientAge: 6,
      patientPhone: '0661987654',
      note: 'Contrôle pédiatrique',
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    },
  ];
}

function generateUniqueRefCode(existingAppointments) {
  const existingCodes = new Set(existingAppointments.map((a) => a.refCode));
  for (let i = 0; i < 40; i++) {
    const num = Math.floor(100 + Math.random() * 900);
    const candidate = `RDV-${num}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
  return `RDV-${String(Date.now()).slice(-4)}`;
}

const dataService = {
  /**
   * Fetch available consultation types.
   * @returns {Promise<Array>}
   */
  async getConsultations() {
    if (SUPABASE_CONFIG.enabled) {
      // Step 3: Replace with fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tables.consultations}?select=*`, ...)
    }
    return CONSULTATION_TYPES;
  },

  /**
   * Fetch already-booked slot times (e.g. ['09:30', '14:30']) for a given ISO date.
   * @param {string} dateStr
   * @returns {Promise<string[]>}
   */
  async getBookedSlots(dateStr) {
    if (SUPABASE_CONFIG.enabled) {
      // Step 3: Query appointments where date=eq.${dateStr}&status=neq.Cancelled
    }
    const appointments = readLocalAppointments();
    return appointments
      .filter((appt) => appt.date === dateStr && appt.status !== 'Cancelled')
      .map((appt) => appt.time);
  },

  /**
   * Create and persist a new appointment, rejecting duplicate slot bookings.
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async createAppointment(payload) {
    if (SUPABASE_CONFIG.enabled) {
      // Step 3: POST to Supabase appointments table with unique constraint on (date, time)
    }

    const appointments = readLocalAppointments();

    // Prevent double-booking the same date + time slot
    const conflict = appointments.some(
      (appt) =>
        appt.date === payload.date &&
        appt.time === payload.time &&
        appt.status !== 'Cancelled'
    );

    if (conflict) {
      throw new Error(
        `The ${payload.time} slot on ${formatDateReadable(payload.date)} was just booked. Please choose another available slot.`
      );
    }

    const newAppointment = {
      refCode: generateUniqueRefCode(appointments),
      consultationId: payload.consultationId,
      consultationName: payload.consultationName,
      feeDA: payload.feeDA,
      date: payload.date,
      time: payload.time,
      visitType: payload.visitType,
      patientName: payload.patientName.trim(),
      patientAge: Number(payload.patientAge),
      patientPhone: normalizePhone(payload.patientPhone),
      note: payload.note ? payload.note.trim() : '',
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };

    appointments.push(newAppointment);
    writeLocalAppointments(appointments);
    return newAppointment;
  },

  /**
   * Look up an appointment by RDV reference code (e.g. RDV-512) or 10-digit mobile number.
   * @param {string} query
   * @returns {Promise<Object|null>}
   */
  async lookupRdv(query) {
    if (SUPABASE_CONFIG.enabled) {
      // Step 3: Query Supabase by ref_code or patient_phone
    }

    const raw = String(query || '').trim();
    if (!raw) return null;

    const appointments = readLocalAppointments();
    const upper = raw.toUpperCase();

    // Exact or numeric shorthand match for RDV code (e.g. "RDV-512" or "512")
    const codeMatch = appointments.find(
      (appt) =>
        appt.refCode.toUpperCase() === upper ||
        appt.refCode.toUpperCase() === `RDV-${upper}`
    );
    if (codeMatch) return codeMatch;

    // Fallback: match latest appointment by normalized Algerian phone number
    const cleanPhone = normalizePhone(raw);
    if (/^0[567]\d{8}$/.test(cleanPhone)) {
      const phoneMatches = appointments.filter((appt) => appt.patientPhone === cleanPhone);
      if (phoneMatches.length > 0) {
        return phoneMatches[phoneMatches.length - 1];
      }
    }

    return null;
  },
};

// ============================================================================
// Application State & DOM References
// ============================================================================

const state = {
  consultations: [],
  selectedConsultationId: 'general',
  selectedDate: '',
  selectedSlot: null,
  visitType: 'First Visit',
  bookedSlots: [],
  quickDates: [],
  lastConfirmed: null,
};

const els = {
  bookingFlow: document.getElementById('booking-flow'),
  consultationGrid: document.getElementById('consultation-grid'),
  quickDates: document.getElementById('quick-dates'),
  dateInput: document.getElementById('rdv-date'),
  dateAlert: document.getElementById('date-alert'),
  morningSlots: document.getElementById('morning-slots'),
  afternoonSlots: document.getElementById('afternoon-slots'),

  bookingForm: document.getElementById('booking-form'),
  visitToggleBtns: document.querySelectorAll('.toggle-btn'),
  patientName: document.getElementById('patient-name'),
  patientAge: document.getElementById('patient-age'),
  patientPhone: document.getElementById('patient-phone'),
  patientNote: document.getElementById('patient-note'),
  errorName: document.getElementById('error-name'),
  errorAge: document.getElementById('error-age'),
  errorPhone: document.getElementById('error-phone'),
  formGlobalError: document.getElementById('form-global-error'),
  submitSummaryText: document.getElementById('submit-summary-text'),
  confirmBtn: document.getElementById('confirm-btn'),

  sideConsultation: document.getElementById('side-consultation'),
  sideFee: document.getElementById('side-fee'),
  sideDate: document.getElementById('side-date'),
  sideTime: document.getElementById('side-time'),
  sideVisit: document.getElementById('side-visit'),

  confirmedSlipSection: document.getElementById('confirmed-slip-section'),
  confirmedSlipCard: document.getElementById('confirmed-slip-card'),
  printConfirmedBtn: document.getElementById('print-confirmed-btn'),
  bookAnotherBtn: document.getElementById('book-another-btn'),

  lookupForm: document.getElementById('lookup-form'),
  lookupQuery: document.getElementById('lookup-query'),
  lookupResult: document.getElementById('lookup-result'),
};

// ============================================================================
// Rendering Functions
// ============================================================================

function getSelectedConsultation() {
  return (
    state.consultations.find((c) => c.id === state.selectedConsultationId) ||
    state.consultations[0]
  );
}

function renderConsultations() {
  els.consultationGrid.innerHTML = state.consultations
    .map((item) => {
      const selected = item.id === state.selectedConsultationId;
      return `
        <button
          type="button"
          class="consult-card ${selected ? 'selected' : ''}"
          data-consult-id="${item.id}"
          role="radio"
          aria-checked="${selected}"
        >
          <div class="consult-top">
            <span class="consult-icon" aria-hidden="true">
              <i data-lucide="${item.icon}"></i>
            </span>
            <span class="consult-price">${formatDA(item.feeDA)}</span>
          </div>
          <div>
            <div class="consult-name">${escapeHTML(item.name)}</div>
            <div class="consult-meta">${escapeHTML(item.subtitle)} · ${item.durationMin} min</div>
          </div>
        </button>
      `;
    })
    .join('');

  refreshIcons();
}

function renderQuickDates() {
  const todayStr = toLocalISODate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toLocalISODate(tomorrow);

  els.quickDates.innerHTML = state.quickDates
    .map((dateStr) => {
      const d = parseISODate(dateStr);
      const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
      const dayNum = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      let tag = '';
      if (dateStr === todayStr) tag = 'Today';
      else if (dateStr === tomorrowStr) tag = 'Tomorrow';

      const selected = dateStr === state.selectedDate;
      return `
        <button
          type="button"
          class="date-pill ${selected ? 'selected' : ''}"
          data-date="${dateStr}"
          aria-pressed="${selected}"
        >
          <span class="date-pill-day">${dayName}</span>
          <span class="date-pill-num">${dayNum}</span>
          ${tag ? `<span class="date-pill-tag">${tag}</span>` : ''}
        </button>
      `;
    })
    .join('');
}

function renderSlotGrid(container, slots, isClosedDay) {
  container.innerHTML = slots
    .map((slot) => {
      const isBooked = state.bookedSlots.includes(slot);
      const isPast = isSlotPastForDate(state.selectedDate, slot);
      const disabled = isClosedDay || isBooked || isPast;
      const isSelected = !disabled && state.selectedSlot === slot;

      let title = `Book ${slot} – ${addMinutesToTime(slot, 20)}`;
      if (isClosedDay) title = 'Clinic closed on Fridays';
      else if (isBooked) title = 'Already booked';
      else if (isPast) title = 'Time has passed';

      return `
        <button
          type="button"
          class="slot-btn ${isSelected ? 'selected' : ''}"
          data-slot="${slot}"
          title="${title}"
          role="radio"
          aria-checked="${isSelected}"
          ${disabled ? 'disabled' : ''}
        >
          ${slot}
        </button>
      `;
    })
    .join('');
}

function renderSlotsAndAlerts() {
  const dateStr = state.selectedDate;
  const closedFriday = isFriday(dateStr);
  const pastDate = isPastDate(dateStr);
  const invalidDay = closedFriday || pastDate;

  if (closedFriday) {
    showDateAlert('Cabinet Santé DZ is closed on Fridays (Vendredi). Please select another day from Saturday to Thursday.');
    state.selectedSlot = null;
  } else if (pastDate) {
    showDateAlert('Past dates cannot be selected. Please choose today or an upcoming weekday.');
    state.selectedSlot = null;
  } else {
    const allSlots = [...MORNING_SLOTS, ...AFTERNOON_SLOTS];
    const availableCount = allSlots.filter(
      (s) => !state.bookedSlots.includes(s) && !isSlotPastForDate(dateStr, s)
    ).length;

    if (availableCount === 0) {
      showDateAlert('All slots for this date have passed or are booked. Please choose another date.');
      state.selectedSlot = null;
    } else {
      hideDateAlert();
    }
  }

  // Clear selectedSlot if it became unavailable
  if (
    state.selectedSlot &&
    (state.bookedSlots.includes(state.selectedSlot) ||
      isSlotPastForDate(dateStr, state.selectedSlot))
  ) {
    state.selectedSlot = null;
  }

  renderSlotGrid(els.morningSlots, MORNING_SLOTS, invalidDay);
  renderSlotGrid(els.afternoonSlots, AFTERNOON_SLOTS, invalidDay);
  updateSummaryUI();
}

function showDateAlert(message) {
  els.dateAlert.classList.remove('hidden');
  els.dateAlert.innerHTML = `
    <i data-lucide="calendar-x-2"></i>
    <span>${escapeHTML(message)}</span>
  `;
  refreshIcons();
}

function hideDateAlert() {
  els.dateAlert.classList.add('hidden');
  els.dateAlert.innerHTML = '';
}

function updateSummaryUI() {
  const consult = getSelectedConsultation();
  const dateLabel = state.selectedDate ? formatDateReadable(state.selectedDate) : '—';
  const slotLabel = state.selectedSlot
    ? `${state.selectedSlot} – ${addMinutesToTime(state.selectedSlot, 20)}`
    : 'Select a slot';

  els.sideConsultation.textContent = consult ? consult.name : '—';
  els.sideFee.textContent = consult ? formatDA(consult.feeDA) : '—';
  els.sideDate.textContent = dateLabel;
  els.sideTime.textContent = slotLabel;
  els.sideVisit.textContent = state.visitType;

  if (consult && state.selectedDate && state.selectedSlot) {
    els.submitSummaryText.textContent = `${consult.name} (${formatDA(consult.feeDA)}) · ${dateLabel} at ${state.selectedSlot}`;
  } else {
    els.submitSummaryText.textContent = 'Please select an available date & time slot';
  }
}

function buildSlipHTML(appt) {
  const endTime = addMinutesToTime(appt.time, 20);
  return `
    <div class="slip-head">
      <div>
        <div class="slip-clinic-title">Cabinet Santé DZ</div>
        <div class="slip-clinic-sub">Dr. Mansouri · Batna City, Algeria</div>
      </div>
      <div class="slip-code-box">
        <span class="slip-code-label">Reference Code</span>
        <span class="slip-code-value">${escapeHTML(appt.refCode)}</span>
      </div>
    </div>

    <div class="slip-body">
      <div class="slip-grid">
        <div>
          <span class="slip-field-label">Patient</span>
          <span class="slip-field-val">${escapeHTML(appt.patientName)} (${appt.patientAge} yrs)</span>
        </div>
        <div>
          <span class="slip-field-label">Mobile Phone</span>
          <span class="slip-field-val mono-text">${escapeHTML(formatPhoneDisplay(appt.patientPhone))}</span>
        </div>
        <div>
          <span class="slip-field-label">Consultation</span>
          <span class="slip-field-val">${escapeHTML(appt.consultationName)}</span>
        </div>
        <div>
          <span class="slip-field-label">Consultation Fee</span>
          <span class="slip-field-val mono-accent">${formatDA(appt.feeDA)}</span>
        </div>
        <div>
          <span class="slip-field-label">Date</span>
          <span class="slip-field-val">${formatDateReadable(appt.date)}</span>
        </div>
        <div>
          <span class="slip-field-label">Time Slot</span>
          <span class="slip-field-val mono-text">${escapeHTML(appt.time)} – ${endTime}</span>
        </div>
        <div>
          <span class="slip-field-label">Visit Type</span>
          <span class="slip-field-val">${escapeHTML(appt.visitType)}</span>
        </div>
      </div>

      ${
        appt.note
          ? `<div class="slip-note-box"><strong>Note:</strong> ${escapeHTML(appt.note)}</div>`
          : ''
      }
    </div>

    <div class="slip-foot">
      <span>Please arrive 10 min early · Payment at reception</span>
      <span class="slip-status-pill">${escapeHTML(appt.status || 'Confirmed')}</span>
    </div>
  `;
}

function showConfirmedSlip(appt) {
  state.lastConfirmed = appt;
  els.confirmedSlipCard.innerHTML = buildSlipHTML(appt);
  els.bookingFlow.classList.add('hidden');
  els.confirmedSlipSection.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
}

function resetToBookingFlow() {
  els.confirmedSlipSection.classList.add('hidden');
  els.bookingFlow.classList.remove('hidden');
  els.bookingForm.reset();
  clearAllFormErrors();
  state.selectedSlot = null;
  setVisitType(getSelectedConsultation()?.defaultVisit || 'First Visit');
  loadSlotsForDate(state.selectedDate);
}

// ============================================================================
// Actions & Validation
// ============================================================================

async function loadSlotsForDate(dateStr) {
  state.selectedDate = dateStr;
  els.dateInput.value = dateStr;
  renderQuickDates();

  state.bookedSlots = await dataService.getBookedSlots(dateStr);
  renderSlotsAndAlerts();
}

function setVisitType(visitType) {
  state.visitType = visitType;
  els.visitToggleBtns.forEach((btn) => {
    const active = btn.dataset.visit === visitType;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  updateSummaryUI();
}

function clearAllFormErrors() {
  els.errorName.textContent = '';
  els.errorAge.textContent = '';
  els.errorPhone.textContent = '';
  els.patientName.classList.remove('input-invalid');
  els.patientAge.classList.remove('input-invalid');
  els.patientPhone.classList.remove('input-invalid');
  els.formGlobalError.classList.add('hidden');
  els.formGlobalError.textContent = '';
}

function showGlobalError(msg) {
  els.formGlobalError.classList.remove('hidden');
  els.formGlobalError.innerHTML = `
    <i data-lucide="alert-circle"></i>
    <span>${escapeHTML(msg)}</span>
  `;
  refreshIcons();
}

function validateBookingForm() {
  clearAllFormErrors();
  let isValid = true;

  if (!state.selectedDate || isFriday(state.selectedDate) || isPastDate(state.selectedDate)) {
    showGlobalError('Please select a valid open clinic date (Saturday to Thursday).');
    isValid = false;
  } else if (!state.selectedSlot) {
    showGlobalError('Please select an available 20-minute time slot before confirming.');
    isValid = false;
  } else if (isSlotPastForDate(state.selectedDate, state.selectedSlot)) {
    showGlobalError('The selected time slot has just passed. Please pick another upcoming slot.');
    renderSlotsAndAlerts();
    isValid = false;
  }

  const name = els.patientName.value.trim();
  if (name.length < 3) {
    els.errorName.textContent = 'Please enter the patient’s full name (at least 3 characters).';
    els.patientName.classList.add('input-invalid');
    isValid = false;
  }

  const ageRaw = els.patientAge.value.trim();
  const ageNum = Number(ageRaw);
  if (ageRaw === '' || !Number.isFinite(ageNum) || ageNum < 0 || ageNum > 120) {
    els.errorAge.textContent = 'Enter a valid age (0–120).';
    els.patientAge.classList.add('input-invalid');
    isValid = false;
  }

  const phoneRaw = els.patientPhone.value.trim();
  if (!isValidAlgerianMobile(phoneRaw)) {
    els.errorPhone.textContent = 'Enter a valid 10-digit Algerian mobile (05, 06, or 07).';
    els.patientPhone.classList.add('input-invalid');
    isValid = false;
  }

  return isValid;
}

// ============================================================================
// Event Listeners
// ============================================================================

function bindEvents() {
  // Consultation selection
  els.consultationGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.consult-card');
    if (!card) return;
    state.selectedConsultationId = card.dataset.consultId;
    const consult = getSelectedConsultation();
    if (consult?.defaultVisit) {
      setVisitType(consult.defaultVisit);
    }
    renderConsultations();
    updateSummaryUI();
  });

  // Quick date pills
  els.quickDates.addEventListener('click', (e) => {
    const pill = e.target.closest('.date-pill');
    if (!pill) return;
    state.selectedSlot = null;
    loadSlotsForDate(pill.dataset.date);
  });

  // Native date picker
  els.dateInput.addEventListener('change', (e) => {
    const chosen = e.target.value;
    if (!chosen) return;
    state.selectedSlot = null;
    loadSlotsForDate(chosen);
  });

  // Slot selection (Morning & Afternoon)
  [els.morningSlots, els.afternoonSlots].forEach((grid) => {
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.slot-btn');
      if (!btn || btn.disabled) return;
      state.selectedSlot = btn.dataset.slot;
      renderSlotsAndAlerts();
    });
  });

  // Visit type segmented toggle
  els.visitToggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setVisitType(btn.dataset.visit);
    });
  });

  // Live phone validation cleanup
  els.patientPhone.addEventListener('input', () => {
    if (isValidAlgerianMobile(els.patientPhone.value)) {
      els.errorPhone.textContent = '';
      els.patientPhone.classList.remove('input-invalid');
    }
  });

  // Submit booking form
  els.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateBookingForm()) return;

    const consult = getSelectedConsultation();
    els.confirmBtn.disabled = true;

    try {
      const created = await dataService.createAppointment({
        consultationId: consult.id,
        consultationName: consult.name,
        feeDA: consult.feeDA,
        date: state.selectedDate,
        time: state.selectedSlot,
        visitType: state.visitType,
        patientName: els.patientName.value,
        patientAge: els.patientAge.value,
        patientPhone: els.patientPhone.value,
        note: els.patientNote.value,
      });

      // Refresh booked slots and display printable slip
      state.bookedSlots = await dataService.getBookedSlots(state.selectedDate);
      showConfirmedSlip(created);
    } catch (err) {
      showGlobalError(err.message || 'Unable to confirm appointment. Please try again.');
      await loadSlotsForDate(state.selectedDate);
    } finally {
      els.confirmBtn.disabled = false;
    }
  });

  // Print confirmed slip
  els.printConfirmedBtn.addEventListener('click', () => {
    document.body.classList.remove('printing-lookup');
    window.print();
  });

  // Book another appointment
  els.bookAnotherBtn.addEventListener('click', () => {
    resetToBookingFlow();
  });

  // Check My RDV Lookup
  els.lookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = els.lookupQuery.value.trim();
    if (!query) {
      els.lookupResult.innerHTML = `
        <div class="lookup-empty">Enter your reference code (e.g. <span class="mono-inline">RDV-512</span>) or mobile phone number.</div>
      `;
      return;
    }

    const found = await dataService.lookupRdv(query);
    if (!found) {
      els.lookupResult.innerHTML = `
        <div class="lookup-empty">No appointment found for <strong>${escapeHTML(query)}</strong>. Check your RDV code or phone number.</div>
      `;
      return;
    }

    els.lookupResult.innerHTML = `
      <article class="slip-card slip-compact">
        ${buildSlipHTML(found)}
      </article>
      <div class="lookup-slip-actions">
        <button type="button" id="print-lookup-btn" class="btn-secondary">
          <i data-lucide="printer"></i>
          <span>Print Slip</span>
        </button>
      </div>
    `;

    refreshIcons();

    const printLookupBtn = document.getElementById('print-lookup-btn');
    if (printLookupBtn) {
      printLookupBtn.addEventListener('click', () => {
        document.body.classList.add('printing-lookup');
        window.print();
      });
    }
  });

  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-lookup');
  });
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ============================================================================
// Initialize App
// ============================================================================

async function init() {
  state.consultations = await dataService.getConsultations();
  state.quickDates = getUpcomingOpenDates(5);

  const todayStr = toLocalISODate(new Date());
  els.dateInput.min = todayStr;

  renderConsultations();
  bindEvents();

  // Default to the first open day with available slots
  const defaultDate = state.quickDates[0] || todayStr;
  await loadSlotsForDate(defaultDate);

  refreshIcons();
}

document.addEventListener('DOMContentLoaded', init);
