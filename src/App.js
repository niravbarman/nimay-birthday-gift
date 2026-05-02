import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth, signInAnon } from './firebase';
import { ref, onValue, set, get } from 'firebase/database';
import './App.css';

const PASSWORD = "Nirav is Lyla's absolute favorite";
const INITIAL_SECONDS = 30 * 3600; // 30 hours

// ─────────────────────────────────────────────────────────────────────────────
// Timer architecture (fixes multi-tab multiplication):
//
//  Firebase /timerState stores:
//    { secondsAtStart, startedAt (unix ms), running }
//
//  NO tab ever writes the ticking value back to Firebase.
//  Every tab independently computes:
//    displayed = secondsAtStart - (Date.now() - startedAt) / 1000
//
//  Only Start and Pause write to Firebase. 100 tabs = 1 timer.
//
//  Firebase /pendingActivity stores the in-progress activity data as a
//  cross-tab lock. While it exists, other tabs cannot start the timer.
// ─────────────────────────────────────────────────────────────────────────────

const formatTime = (totalSeconds) => {
  const neg = totalSeconds < 0;
  const abs = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(abs / 3600).toString().padStart(2, '0');
  const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return { neg, str: `${h}:${m}:${s}` };
};

const nowLabel = () => {
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

// ── Activity Blocked Modal ────────────────────────────────────────────────────
function ActivityBlockedModal({ onClose, onOverride }) {
  const [showPassword, setShowPassword] = useState(false);

  if (showPassword) {
    return (
      <PasswordModal
        onConfirm={onOverride}
        onCancel={() => setShowPassword(false)}
      />
    );
  }

  return (
    <div className="overlay">
      <div className="modal small-modal">
        <h2>Can't start timer.</h2>
        <p className="sub-text">Activity being created.</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-warn" onClick={() => setShowPassword(true)}>Override</button>
        </div>
      </div>
    </div>
  );
}

// ── Description Modal ─────────────────────────────────────────────────────────
function DescriptionModal({ activity, onClose, onEdit, onDelete }) {
  const [mode, setMode] = useState(null);

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
function ActivityModal({ timeUsedSecs, startedAt, onLog, onCancel }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { date, time } = startedAt || nowLabel();
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
        <input type="text" className="text-input" value={name}
          onChange={e => setName(e.target.value)} placeholder="Give this activity a name…" />
        <label className="field-label">Activity Description:</label>
        <textarea className="text-input textarea" value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Describe what you did together…" rows={5} />
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
        <input type="text" className="text-input" value={name}
          onChange={e => setName(e.target.value)} />
        <label className="field-label">Activity Description:</label>
        <textarea className="text-input textarea" value={desc}
          onChange={e => setDesc(e.target.value)} rows={5} />
        <label className="field-label">Status:</label>
        <div className="toggle-row">
          <button className={`btn btn-sm ${logged ? 'btn-success' : 'btn-ghost'}`}
            onClick={() => setLogged(true)}>Logged</button>
          <button className={`btn btn-sm ${!logged ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => setLogged(false)}>Cancelled</button>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onClose}>Discard Changes</button>
          <button className="btn btn-primary"
            onClick={() => onSave({ name, description: desc, logged })}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ready, setReady]                 = useState(false);
  const [timerSeconds, setTimerSeconds]   = useState(INITIAL_SECONDS);
  const [running, setRunning]             = useState(false);
  const [activities, setActivities]       = useState([]);
  const [activityModal, setActivityModal] = useState(null);
  const [descModal, setDescModal]         = useState(null);
  const [editModal, setEditModal]         = useState(null);
  const [flashRed, setFlashRed]           = useState(false);
  const [blockedModal, setBlockedModal]   = useState(false);
  const [pendingActivity, setPendingActivity] = useState(null);

  // Raw Firebase timer state — read by the local display tick
  const timerStateRef  = useRef({ secondsAtStart: INITIAL_SECONDS, startedAt: null, running: false });
  // Whether THIS tab triggered the pause (so it shows the modal)
  const thisTabPausedRef = useRef(false);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    signInAnon().then(() => setReady(true)).catch(console.error);
  }, []);

  // ── Firebase listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;

    const unsubState = onValue(ref(db, 'timerState'), snap => {
      const val = snap.val();
      if (!val) return;
      timerStateRef.current = val;
      setRunning(!!val.running);
    });

    const unsubActs = onValue(ref(db, 'activities'), snap => {
      const val = snap.val();
      if (val) {
        const list = Object.entries(val).map(([id, a]) => ({ id, ...a }));
        list.sort((a, b) => a.createdAt - b.createdAt);
        setActivities(list);
      } else {
        setActivities([]);
      }
    });

    const unsubPending = onValue(ref(db, 'pendingActivity'), snap => {
      const val = snap.val() || null;
      setPendingActivity(val);
    });

    return () => { unsubState(); unsubActs(); unsubPending(); };
  }, [ready]);

  // ── Show modal on this tab when it caused the pause ───────────────────────
  useEffect(() => {
    if (pendingActivity && thisTabPausedRef.current) {
      setActivityModal({
        timeUsedSecs:     pendingActivity.timeUsedSecs,
        startedAt:        { date: pendingActivity.pausedDate, time: pendingActivity.pausedTime },
        timerBeforeStart: pendingActivity.timerBeforeStart,
      });
      thisTabPausedRef.current = false;
    }
  }, [pendingActivity]);

  // ── Local display tick — READS only, never writes ─────────────────────────
  useEffect(() => {
    const tick = () => {
      const { secondsAtStart, startedAt, running: r } = timerStateRef.current;
      if (r && startedAt) {
        const elapsed   = (Date.now() - startedAt) / 1000;
        const displayed = secondsAtStart - elapsed;
        setTimerSeconds(displayed);
        setFlashRed(displayed < 0);
      } else {
        setTimerSeconds(secondsAtStart ?? INITIAL_SECONDS);
        setFlashRed(false);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [ready]);

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    const pendSnap = await get(ref(db, 'pendingActivity'));
    if (pendSnap.val()) {
      setBlockedModal(true);
      return;
    }
    const stateSnap = await get(ref(db, 'timerState'));
    const state     = stateSnap.val() || {};
    const secondsNow = state.running
      ? state.secondsAtStart - (Date.now() - state.startedAt) / 1000
      : (state.secondsAtStart ?? INITIAL_SECONDS);

    await set(ref(db, 'timerState'), {
      secondsAtStart: secondsNow,
      startedAt:      Date.now(),
      running:        true,
    });
  }, []);

  // ── Pause ─────────────────────────────────────────────────────────────────
  const handlePause = useCallback(async () => {
    const stateSnap = await get(ref(db, 'timerState'));
    const state     = stateSnap.val() || {};
    const currentSeconds = state.running
      ? state.secondsAtStart - (Date.now() - state.startedAt) / 1000
      : (state.secondsAtStart ?? INITIAL_SECONDS);

    // Freeze the timer
    await set(ref(db, 'timerState'), {
      secondsAtStart: currentSeconds,
      startedAt:      null,
      running:        false,
    });

    // Write lock so other tabs see "activity being created"
    const { date, time } = nowLabel();
    await set(ref(db, 'pendingActivity'), {
      timeUsedSecs:     (state.secondsAtStart ?? INITIAL_SECONDS) - currentSeconds,
      timerBeforeStart: state.secondsAtStart ?? INITIAL_SECONDS,
      pausedDate:       date,
      pausedTime:       time,
    });

    thisTabPausedRef.current = true;
  }, []);

  // ── Log Activity ──────────────────────────────────────────────────────────
  const handleLogActivity = useCallback(async ({ name, description }) => {
    const pa = pendingActivity;
    if (!pa) return;
    await set(ref(db, `activities/${uid()}`), {
      name:         name || 'Untitled',
      description,
      timeUsedSecs: pa.timeUsedSecs,
      dateCreated:  pa.pausedDate,
      timeCreated:  pa.pausedTime,
      logged:       true,
      createdAt:    Date.now(),
    });
    await set(ref(db, 'pendingActivity'), null);
    setActivityModal(null);
  }, [pendingActivity]);

  // ── Cancel Activity ───────────────────────────────────────────────────────
  const handleCancelActivity = useCallback(async ({ name, description }) => {
    const pa = pendingActivity;
    if (!pa) return;
    await set(ref(db, `activities/${uid()}`), {
      name:         name || 'Untitled',
      description,
      timeUsedSecs: pa.timeUsedSecs,
      dateCreated:  pa.pausedDate,
      timeCreated:  pa.pausedTime,
      logged:       false,
      createdAt:    Date.now(),
    });
    // Revert timer
    await set(ref(db, 'timerState'), {
      secondsAtStart: pa.timerBeforeStart,
      startedAt:      null,
      running:        false,
    });
    await set(ref(db, 'pendingActivity'), null);
    setActivityModal(null);
  }, [pendingActivity]);

  // ── Override (force-dismiss pending activity from another tab) ────────────
  const handleOverride = useCallback(async () => {
    const pa = pendingActivity;
    if (pa) {
      // Log as cancelled with a generic name
      await set(ref(db, `activities/${uid()}`), {
        name:         'Overridden Activity',
        description:  '',
        timeUsedSecs: pa.timeUsedSecs,
        dateCreated:  pa.pausedDate,
        timeCreated:  pa.pausedTime,
        logged:       false,
        createdAt:    Date.now(),
      });
      // Revert timer to before the overridden session
      await set(ref(db, 'timerState'), {
        secondsAtStart: pa.timerBeforeStart,
        startedAt:      null,
        running:        false,
      });
      await set(ref(db, 'pendingActivity'), null);
    }
    setActivityModal(null);
    setBlockedModal(false);
  }, [pendingActivity]);

  // ── Edit Activity ─────────────────────────────────────────────────────────
  const handleEditActivity = useCallback((activity) => {
    setDescModal(null);
    setEditModal(activity);
  }, []);

  const handleSaveEdit = useCallback(async ({ name, description, logged }) => {
    const original  = editModal;
    const wasLogged = original.logged;
    const updated   = { ...original, name, description, logged };
    delete updated.id;
    await set(ref(db, `activities/${original.id}`), updated);

    const snap  = await get(ref(db, 'timerState'));
    const state = snap.val() || {};
    const cur   = state.running
      ? state.secondsAtStart - (Date.now() - state.startedAt) / 1000
      : (state.secondsAtStart ?? INITIAL_SECONDS);

    if (!wasLogged && logged) {
      await set(ref(db, 'timerState'), {
        ...state, secondsAtStart: cur - original.timeUsedSecs,
        startedAt: state.running ? Date.now() : null,
      });
    } else if (wasLogged && !logged) {
      await set(ref(db, 'timerState'), {
        ...state, secondsAtStart: cur + original.timeUsedSecs,
        startedAt: state.running ? Date.now() : null,
      });
    }
    setEditModal(null);
  }, [editModal]);

  // ── Delete Activity ───────────────────────────────────────────────────────
  const handleDeleteActivity = useCallback(async (activity) => {
    await set(ref(db, `activities/${activity.id}`), null);
    if (activity.logged) {
      const snap  = await get(ref(db, 'timerState'));
      const state = snap.val() || {};
      const cur   = state.running
        ? state.secondsAtStart - (Date.now() - state.startedAt) / 1000
        : (state.secondsAtStart ?? INITIAL_SECONDS);
      await set(ref(db, 'timerState'), {
        ...state, secondsAtStart: cur + activity.timeUsedSecs,
        startedAt: state.running ? Date.now() : null,
      });
    }
    setDescModal(null);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const lastActivityLogged =
    activities.length > 0 &&
    activities[activities.length - 1]?.logged === true &&
    timerSeconds <= 0;

  const { neg, str: timeStr } = formatTime(timerSeconds);

  // ── Render ────────────────────────────────────────────────────────────────
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

      {activityModal && !editModal && (
        <ActivityModal
          timeUsedSecs={activityModal.timeUsedSecs}
          startedAt={activityModal.startedAt}
          onLog={handleLogActivity}
          onCancel={handleCancelActivity}
        />
      )}

      {editModal && (
        <EditActivityModal
          activity={editModal}
          onSave={handleSaveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {descModal && !editModal && (
        <DescriptionModal
          activity={descModal}
          onClose={() => setDescModal(null)}
          onEdit={() => handleEditActivity(descModal)}
          onDelete={() => handleDeleteActivity(descModal)}
        />
      )}

      {blockedModal && (
        <ActivityBlockedModal
          onClose={() => setBlockedModal(false)}
          onOverride={handleOverride}
        />
      )}
    </div>
  );
}
