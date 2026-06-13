import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Spinner } from "../components.jsx";

function RecordRow({ icon, label, desc, value, sub, onPress, onPressSecond, secondLabel }) {
  return (
    <div className="record-row">
      <div className="record-icon">{icon}</div>
      <div className="record-body">
        <div className="record-label">{label}</div>
        <div className="record-desc">{desc}</div>
        {sub && (
          <div className="record-sub-names">
            {onPress
              ? <span className="record-name-link" onClick={onPress}>{sub}</span>
              : <span>{sub}</span>}
            {onPressSecond && secondLabel && (
              <>
                <span className="record-vs"> vs </span>
                <span className="record-name-link" onClick={onPressSecond}>{secondLabel}</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="record-value">{value}</div>
    </div>
  );
}

export function Records({ navigate }) {
  const { t, toastError } = useApp();
  const [data, setData] = useState(null);
  const r = t.records_ext;

  useEffect(() => {
    api.get("/records").then(setData).catch(toastError);
  }, [toastError]);

  if (!data) return <Spinner />;
  const { allTime, monthly, weekly } = data;

  function go(id, name) {
    if (id) navigate("player", { playerId: id, title: name });
  }

  return (
    <>
      <div className="card">
        <div className="s-sect" style={{ color: "#FFD60A" }}>{r.allTime}</div>
        {allTime.bestStreak && (
          <RecordRow
            icon="🔥" label={r.bestStreak.label}
            desc={r.bestStreak.desc}
            value={`${allTime.bestStreak.count} ${r.inARow}`}
            sub={allTime.bestStreak.name}
            onPress={() => go(allTime.bestStreak.id, allTime.bestStreak.name)}
          />
        )}
        {allTime.peakElo && (
          <RecordRow
            icon="👑" label={r.peakElo.label}
            desc={r.peakElo.desc}
            value={`${allTime.peakElo.elo} ${t.elo}`}
            sub={allTime.peakElo.name}
            onPress={() => go(allTime.peakElo.id, allTime.peakElo.name)}
          />
        )}
        {allTime.veteran && (
          <RecordRow
            icon="💼" label={r.veteran.label}
            desc={r.veteran.desc}
            value={`${allTime.veteran.count} ${r.matchesWord}`}
            sub={allTime.veteran.name}
            onPress={() => go(allTime.veteran.id, allTime.veteran.name)}
          />
        )}
        {allTime.derby && (
          <RecordRow
            icon="🤝" label={r.derby.label}
            desc={r.derby.desc}
            value={`${allTime.derby.count} ${r.matchesWord}`}
            sub={allTime.derby.playerA.name}
            onPress={() => go(allTime.derby.playerA.id, allTime.derby.playerA.name)}
            secondLabel={allTime.derby.playerB.name}
            onPressSecond={() => go(allTime.derby.playerB.id, allTime.derby.playerB.name)}
          />
        )}
        {allTime.boss && (
          <RecordRow
            icon="🦖" label={r.boss.label}
            desc={r.boss.desc}
            value={`${allTime.boss.winRate}%`}
            sub={allTime.boss.name}
            onPress={() => go(allTime.boss.id, allTime.boss.name)}
          />
        )}
        {allTime.upset && (
          <RecordRow
            icon="🏹" label={r.upset.label}
            desc={r.upset.desc}
            value={`+${allTime.upset.diff} ${t.elo}`}
            sub={allTime.upset.winnerName}
            onPress={() => go(allTime.upset.winnerId, allTime.upset.winnerName)}
            secondLabel={allTime.upset.loserName}
            onPressSecond={() => go(allTime.upset.loserId, allTime.upset.loserName)}
          />
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#FF9F0A" }}>{r.thisMonth}</div>
        {monthly.mostMatches && (
          <RecordRow
            icon="🎯" label={r.mostMatches.label}
            desc={r.mostMatches.desc}
            value={`${monthly.mostMatches.count} ${r.gamesWord}`}
            sub={monthly.mostMatches.name}
            onPress={() => go(monthly.mostMatches.id, monthly.mostMatches.name)}
          />
        )}
        {monthly.topGainer && (
          <RecordRow
            icon="📈" label={r.topGainer.label}
            desc={r.topGainer.desc}
            value={`+${monthly.topGainer.gain} ${t.elo}`}
            sub={monthly.topGainer.name}
            onPress={() => go(monthly.topGainer.id, monthly.topGainer.name)}
          />
        )}
        {monthly.topDonor && (
          <RecordRow
            icon="📉" label={r.topDonor.label}
            desc={r.topDonor.desc}
            value={`${monthly.topDonor.loss} ${t.elo}`}
            sub={monthly.topDonor.name}
            onPress={() => go(monthly.topDonor.id, monthly.topDonor.name)}
          />
        )}
        {monthly.topHunter && (
          <RecordRow
            icon="⚔️" label={r.topHunter.label}
            desc={r.topHunter.desc}
            value={`${monthly.topHunter.count} ${r.opponentsWord}`}
            sub={monthly.topHunter.name}
            onPress={() => go(monthly.topHunter.id, monthly.topHunter.name)}
          />
        )}
        {!monthly.mostMatches && !monthly.topGainer && (
          <div className="hint" style={{ paddingBottom: 12 }}>{r.noMonthly}</div>
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#30D158" }}>{r.thisWeek}</div>
        {weekly.topGainer && (
          <RecordRow
            icon="⚡" label={r.fastGrowth.label}
            desc={r.fastGrowth.desc}
            value={`+${weekly.topGainer.gain} ${t.elo}`}
            sub={weekly.topGainer.name}
            onPress={() => go(weekly.topGainer.id, weekly.topGainer.name)}
          />
        )}
        {weekly.marathon && (
          <RecordRow
            icon="🎰" label={r.weekMarathon.label}
            desc={r.weekMarathon.desc}
            value={`${weekly.marathon.count} ${r.matchesWord}`}
            sub={weekly.marathon.name}
            onPress={() => go(weekly.marathon.id, weekly.marathon.name)}
          />
        )}
        {!weekly.topGainer && !weekly.marathon && (
          <div className="hint" style={{ paddingBottom: 12 }}>{r.noWeekly}</div>
        )}
      </div>
    </>
  );
}
