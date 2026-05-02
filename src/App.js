import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth, signInAnon } from './firebase';
import { ref, onValue, set, get } from 'firebase/database';
import './App.css';

const PASSWORD = "Nirav is Lyla's absolute favorite";
const INITIAL_SECONDS = 30 * 3600; // 30 hours

// ── helpers ──────────────────────────────────────────────────────────────────
const formatTime = (totalSeconds) => {
  const neg = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600).toString().padStart(2, '0');
  const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return { neg, str: `${h}:${m}:${s}` };
};

const now = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ── Password Gate Modal ───────────────────────────────────────────────────────
function PasswordModal({ onConfirm, onCancel }) {
  const [pw, setPw] = useState('');
  const [wrong, setWrong] = useState(false);

  const check = () => {
    if (pw === PASSWORD) { onConfirm(); }
    else { setWrong(true); setPw(''); }
  };

  return (
    <div className="overlay">
      <div className="modal password-modal">
        <h2>Are you sure?</h2>
        <label className="field-label">Password</label>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setWrong(false); }}
          onKeyDown={e => e.key === 'Enter' && check()}
          className={`text-input${wrong ? ' input-error' : ''}`}
          placeholder="Enter password…"
          autoFocus
        />
        {wrong && <p className="error-msg">Incorrect password. Try again.</p>}
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={check}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Description Modal ─────────────────────────────────────────────────────────
function DescriptionModal({ activity, onClose, onEdit, onDelete }) {
  const [mode, setMode] = useState(null); // 'edit' | 'delete'

  if (mode) {
    return (
      <PasswordModal
        onConfirm={() => { mode === 'edit' ? onEdit() : onDelete(); }}
        onCancel={() => setMode(null)}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal desc-modal">
        <h2 className="modal-title">Description:</h2>
        <p className="desc-text">{activity.description || <em>No description provided.</em>}</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-warn" onClick={() => setMode('edit')}>Edit</button>
          <button className="btn btn-danger" onClick={() => setMode('delete')}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel Confirm Modal ──────────────────────────────────────────────────────
function CancelConfirmModal({ onConfirm, onKeepEditing }) {
  return (
    <div className="overlay">
      <div className="modal small-modal">
        <h2>Are you sure?</h2>
        <p className="sub-text">This activity will be logged as <strong>Cancelled</strong> and the timer will be reverted.</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onKeepEditing}>Keep Editing</button>
          <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Activity Created Modal ────────────────────────────────────────────────────
function ActivityModal({ timeUsedSecs, startedAt, onLog, onCancel, initialData }) {
  const [name, setName] = useState(initialData?.name || '');
  const [desc, setDesc] = useState(initialData?.description || '');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { date, time } = initialData
    ? { date: initialData.dateCreated, time: initialData.timeCreated }
    : (startedAt || now());

  const timeUsed = formatTime(timeUsedSecs);

  if (showCancelConfirm) {
    return (
      <CancelConfirmModal
        onConfirm={() => onCancel({ name, description: desc })}
        onKeepEditing={() => setShowCancelConfirm(false)}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal activity-modal">
        <div className="modal-header-row">
          <h2 className="modal-title">Activity Created</h2>
          <div className="modal-meta">
            <span className="meta-chip time-chip">
              ⏱ {timeUsed.neg ? '-' : ''}{timeUsed.str} used
            </span>
            <span className="meta-chip date-chip">📅 {date}</span>
            <span className="meta-chip date-chip">🕐 {time}</span>
          </div>
        </div>

        <label className="field-label">Name Activity:</label>
        <input
          type="text"
          className="text-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Give this activity a name…"
        />

        <label className="field-label">Activity Description:</label>
        <textarea
          className="text-input textarea"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Describe what you did together…"
          rows={5}
        />

        <div className="btn-row">
          <button className="btn btn-warn" onClick={() => setShowCancelConfirm(true)}>
            Cancel Activity
          </button>
          <button className="btn btn-success" onClick={() => onLog({ name, description: desc })}>
            Log Activity
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(INITIAL_SECONDS);
  const [running, setRunning] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activityModal, setActivityModal] = useState(null);
  const [descModal, setDescModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [flashRed, setFlashRed] = useState(false);

  const timerRef = useRef(null);
  const sessionStartRef = useRef(null); // seconds at which this run started
  const pausedAtRef = useRef(null);     // timestamp info when paused

  // ── Firebase Auth ────────────────────────────────────────────────────────
  useEffect(() => {
    signInAnon().then(() => setReady(true)).catch(console.error);
  }, []);

  // ── Firebase Listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const timerDbRef = ref(db, 'timer');
    const unsubTimer = onValue(timerDbRef, snap => {
      const val = snap.val();
      if (val !== null) setTimerSeconds(val);
    });

    const runningDbRef = ref(db, 'running');
    const unsubRunning = onValue(runningDbRef, snap => {
      const val = snap.val();
      if (val !== null) setRunning(!!val);
    });

    const activitiesDbRef = ref(db, 'activities');
    const unsubActivities = onValue(activitiesDbRef, snap => {
      const val = snap.val();
      if (val) {
        const list = Object.entries(val).map(([id, a]) => ({ id, ...a }));
        list.sort((a, b) => a.createdAt - b.createdAt);
        setActivities(list);
      } else {
        setActivities([]);
      }
    });

    return () => { unsubTimer(); unsubRunning(); unsubActivities(); };
  }, [ready]);

  // ── Flash red when negative ──────────────────────────────────────────────
  useEffect(() => {
    if (timerSeconds < 0 && running) setFlashRed(true);
    else if (timerSeconds >= 0) setFlashRed(false);
  }, [timerSeconds, running]);

  // ── Local countdown tick ─────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          const next = prev - 1;
          set(ref(db, 'timer'), next);
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  // ── Last activity logged check ───────────────────────────────────────────
  const lastActivityLogged = activities.length > 0 &&
    activities[activities.length - 1]?.logged === true &&
    timerSeconds <= 0;

  // ── Start ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (lastActivityLogged) return;
    sessionStartRef.current = timerSeconds;
    set(ref(db, 'running'), true);
  }, [timerSeconds, lastActivityLogged]);

  // ── Pause ────────────────────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    set(ref(db, 'running'), false);
    const timeUsed = (sessionStartRef.current ?? INITIAL_SECONDS) - timerSeconds;
    pausedAtRef.current = now();
    setActivityModal({
      timeUsedSecs: timeUsed,
      startedAt: pausedAtRef.current,
      timerBeforeStart: sessionStartRef.current ?? INITIAL_SECONDS,
    });
  }, [timerSeconds]);

  // ── Log Activity ─────────────────────────────────────────────────────────
  const handleLogActivity = useCallback(({ name, description }) => {
    const { date, time } = pausedAtRef.current || now();
    const id = uid();
    const entry = {
      name: name || 'Untitled',
      description,
      timeUsedSecs: activityModal.timeUsedSecs,
      dateCreated: date,
      timeCreated: time,
      logged: true,
      createdAt: Date.now(),
    };
    set(ref(db, `activities/${id}`), entry);
    setActivityModal(null);
    sessionStartRef.current = null;
  }, [activityModal]);

  // ── Cancel Activity ──────────────────────────────────────────────────────
  const handleCancelActivity = useCallback(({ name, description }) => {
    const { date, time } = pausedAtRef.current || now();
    const id = uid();
    const entry = {
      name: name || 'Untitled',
      description,
      timeUsedSecs: activityModal.timeUsedSecs,
      dateCreated: date,
      timeCreated: time,
      logged: false,
      createdAt: Date.now(),
    };
    set(ref(db, `activities/${id}`), entry);
    // revert timer
    const revertTo = activityModal.timerBeforeStart;
    set(ref(db, 'timer'), revertTo);
    setTimerSeconds(revertTo);
    setActivityModal(null);
    sessionStartRef.current = null;
  }, [activityModal]);

  // ── Edit Activity ─────────────────────────────────────────────────────────
  const handleEditActivity = useCallback((activity) => {
    setDescModal(null);
    setEditModal(activity);
  }, []);

  const handleSaveEdit = useCallback(({ name, description, logged }) => {
    const original = editModal;
    const wasLogged = original.logged;
    const nowLogged = logged;

    const updated = { ...original, name, description, logged: nowLogged };
    delete updated.id;

    set(ref(db, `activities/${original.id}`), updated);

    // adjust timer if logged status changed
    if (!wasLogged && nowLogged) {
      // was cancelled, now logged → deduct time
      const newTimer = timerSeconds - original.timeUsedSecs;
      set(ref(db, 'timer'), newTimer);
    } else if (wasLogged && !nowLogged) {
      // was logged, now cancelled → add time back
      const newTimer = timerSeconds + original.timeUsedSecs;
      set(ref(db, 'timer'), newTimer);
    }
    setEditModal(null);
  }, [editModal, timerSeconds]);

  // ── Delete Activity ───────────────────────────────────────────────────────
  const handleDeleteActivity = useCallback((activity) => {
    set(ref(db, `activities/${activity.id}`), null);
    if (activity.logged) {
      const newTimer = timerSeconds + activity.timeUsedSecs;
      set(ref(db, 'timer'), newTimer);
    }
    setDescModal(null);
  }, [timerSeconds]);

  // ── Render ────────────────────────────────────────────────────────────────
  const { neg, str: timeStr } = formatTime(timerSeconds);

  return (
    <div className={`app${flashRed ? ' flash-red' : ''}`}>
      <div className="stars" aria-hidden />

      <header className="hero">
        <div className="confetti-strip" aria-hidden>
          {['🎂','🎉','🎈','✨','🎊','🥳','🎁','🎀','🎂','🎉','🎈','✨','🎊','🥳','🎁','🎀'].map((e,i) => (
            <span key={i} className="confetti-emoji" style={{ '--i': i }}>{e}</span>
          ))}
        </div>
        <h1 className="main-title">Nimay's Birthday Gift</h1>
        <p className="subtitle">
          For Nimay's 30th birthday, Nirav is gifting him{' '}
          <strong>30 hours of his time</strong> to be spent on activities together.
        </p>
      </header>

      <section className="timer-section">
        <div className={`timer-display${neg ? ' timer-negative' : ''}`}>
          {neg && <span className="neg-sign">−</span>}
          <span className="timer-digits">{timeStr}</span>
        </div>
        {neg && <p className="overtime-label">⚠ Overtime — Nirav owes Nimay extra time!</p>}

        <div className="timer-controls">
          {running ? (
            <button className="btn btn-pause" onClick={handlePause}>
              ⏸ Pause Timer
            </button>
          ) : (
            <button
              className={`btn btn-start${lastActivityLogged ? ' btn-disabled' : ''}`}
              onClick={handleStart}
              disabled={lastActivityLogged}
              title={lastActivityLogged ? 'All time has been used and logged.' : ''}
            >
              ▶ Start Timer
            </button>
          )}
        </div>
      </section>

      {activities.length > 0 && (
        <section className="table-section">
          <h2 className="table-heading">Activity Log</h2>
          <div className="table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Time Used</th>
                  <th>Date Created</th>
                  <th>Time Created</th>
                  <th>Logged?</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {activities.map(act => {
                  const { neg: n, str: t } = formatTime(act.timeUsedSecs);
                  return (
                    <tr key={act.id} className={act.logged ? 'row-logged' : 'row-cancelled'}>
                      <td className="td-name">{act.name}</td>
                      <td className="td-time">{n ? '-' : ''}{t}</td>
                      <td>{act.dateCreated}</td>
                      <td>{act.timeCreated}</td>
                      <td>
                        <span className={`badge ${act.logged ? 'badge-logged' : 'badge-cancelled'}`}>
                          {act.logged ? 'Logged' : 'Cancelled'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-show" onClick={() => setDescModal(act)}>
                          Show Description
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Activity Created Modal (new) */}
      {activityModal && !editModal && (
        <ActivityModal
          timeUsedSecs={activityModal.timeUsedSecs}
          startedAt={activityModal.startedAt}
          onLog={handleLogActivity}
          onCancel={handleCancelActivity}
        />
      )}

      {/* Edit Modal */}
      {editModal && (
        <EditActivityModal
          activity={editModal}
          onSave={handleSaveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Description Modal */}
      {descModal && !editModal && (
        <DescriptionModal
          activity={descModal}
          onClose={() => setDescModal(null)}
          onEdit={() => handleEditActivity(descModal)}
          onDelete={() => handleDeleteActivity(descModal)}
        />
      )}
    </div>
  );
}

// ── Edit Activity Modal ───────────────────────────────────────────────────────
function EditActivityModal({ activity, onSave, onClose }) {
  const [name, setName] = useState(activity.name);
  const [desc, setDesc] = useState(activity.description || '');
  const [logged, setLogged] = useState(activity.logged);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { neg, str } = formatTime(activity.timeUsedSecs);

  if (showCancelConfirm) {
    return (
      <CancelConfirmModal
        onConfirm={() => onSave({ name, description: desc, logged: false })}
        onKeepEditing={() => setShowCancelConfirm(false)}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal activity-modal">
        <div className="modal-header-row">
          <h2 className="modal-title">Edit Activity</h2>
          <div className="modal-meta">
            <span className="meta-chip time-chip">⏱ {neg ? '-' : ''}{str} used</span>
            <span className="meta-chip date-chip">📅 {activity.dateCreated}</span>
            <span className="meta-chip date-chip">🕐 {activity.timeCreated}</span>
          </div>
        </div>

        <label className="field-label">Name Activity:</label>
        <input
          type="text"
          className="text-input"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <label className="field-label">Activity Description:</label>
        <textarea
          className="text-input textarea"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={5}
        />

        <label className="field-label">Status:</label>
        <div className="toggle-row">
          <button
            className={`btn btn-sm ${logged ? 'btn-success' : 'btn-ghost'}`}
            onClick={() => setLogged(true)}
          >Logged</button>
          <button
            className={`btn btn-sm ${!logged ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setLogged(false)}
          >Cancelled</button>
        </div>

        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Discard Changes</button>
          <button className="btn btn-primary" onClick={() => onSave({ name, description: desc, logged })}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
