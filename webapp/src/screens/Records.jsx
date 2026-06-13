import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useApp } from "../store.jsx";
import { Spinner } from "../components.jsx";

function RecordRow({ icon, label, value, sub, onPress }) {
  return (
    <div className={`record-row${onPress ? " clickable" : ""}`} onClick={onPress}>
      <div className="record-icon">{icon}</div>
      <div className="record-body">
        <div className="record-label">{label}</div>
        {sub && <div className="record-sub">{sub}</div>}
      </div>
      <div className="record-value">{value}</div>
    </div>
  );
}

export function Records({ navigate }) {
  const { toastError } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/records").then(setData).catch(toastError);
  }, [toastError]);

  if (!data) return <Spinner />;
  const { allTime, monthly, weekly } = data;

  function goPlayer(id, name) {
    if (id) navigate("player", { playerId: id, title: name });
  }

  return (
    <>
      <div className="card">
        <div className="s-sect" style={{ color: "#FFD60A" }}>⚡ Все времена</div>
        {allTime.bestStreak && (
          <RecordRow
            icon="🔥" label="Самая длинная серия побед"
            value={`${allTime.bestStreak.count} подряд`}
            sub={allTime.bestStreak.name}
            onPress={() => goPlayer(allTime.bestStreak.id, allTime.bestStreak.name)}
          />
        )}
        {allTime.peakElo && (
          <RecordRow
            icon="👑" label="Исторический пик рейтинга"
            value={`${allTime.peakElo.elo} эло`}
            sub={allTime.peakElo.name}
            onPress={() => goPlayer(allTime.peakElo.id, allTime.peakElo.name)}
          />
        )}
        {allTime.veteran && (
          <RecordRow
            icon="💼" label="Главный ветеран клуба"
            value={`${allTime.veteran.count} матчей`}
            sub={allTime.veteran.name}
            onPress={() => goPlayer(allTime.veteran.id, allTime.veteran.name)}
          />
        )}
        {allTime.derby && (
          <RecordRow
            icon="🤝" label="Самое частое противостояние"
            value={`${allTime.derby.count} матчей`}
            sub={`${allTime.derby.playerA.name} vs ${allTime.derby.playerB.name}`}
          />
        )}
        {allTime.boss && (
          <RecordRow
            icon="🦖" label="Непобедимый босс"
            value={`${allTime.boss.winRate}%`}
            sub={`${allTime.boss.name} · мин. 20 матчей`}
            onPress={() => goPlayer(allTime.boss.id, allTime.boss.name)}
          />
        )}
        {allTime.upset && (
          <RecordRow
            icon="🏹" label="Главный апсет"
            value={`+${allTime.upset.diff} эло`}
            sub={`${allTime.upset.winnerName} обыграл ${allTime.upset.loserName}`}
          />
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#FF9F0A" }}>📅 Месяц</div>
        {monthly.mostMatches && (
          <RecordRow
            icon="🎯" label="Больше всего матчей"
            value={`${monthly.mostMatches.count} игр`}
            sub={monthly.mostMatches.name}
            onPress={() => goPlayer(monthly.mostMatches.id, monthly.mostMatches.name)}
          />
        )}
        {monthly.topGainer && (
          <RecordRow
            icon="📈" label="Гроза месяца"
            value={`+${monthly.topGainer.gain} эло`}
            sub={monthly.topGainer.name}
            onPress={() => goPlayer(monthly.topGainer.id, monthly.topGainer.name)}
          />
        )}
        {monthly.topDonor && (
          <RecordRow
            icon="📉" label="Главный донор"
            value={`${monthly.topDonor.loss} эло`}
            sub={monthly.topDonor.name}
            onPress={() => goPlayer(monthly.topDonor.id, monthly.topDonor.name)}
          />
        )}
        {monthly.topHunter && (
          <RecordRow
            icon="⚔️" label="Охотник за головами"
            value={`${monthly.topHunter.count} соперников`}
            sub={monthly.topHunter.name}
            onPress={() => goPlayer(monthly.topHunter.id, monthly.topHunter.name)}
          />
        )}
        {!monthly.mostMatches && !monthly.topGainer && (
          <div className="hint" style={{ paddingBottom: 12 }}>Матчи в этом месяце ещё не сыграны</div>
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#30D158" }}>🚀 Неделя</div>
        {weekly.topGainer && (
          <RecordRow
            icon="⚡" label="Самый быстрый рост"
            value={`+${weekly.topGainer.gain} эло`}
            sub={weekly.topGainer.name}
            onPress={() => goPlayer(weekly.topGainer.id, weekly.topGainer.name)}
          />
        )}
        {weekly.marathon && (
          <RecordRow
            icon="🎰" label="Марафон недели"
            value={`${weekly.marathon.count} матчей`}
            sub={weekly.marathon.name}
            onPress={() => goPlayer(weekly.marathon.id, weekly.marathon.name)}
          />
        )}
        {!weekly.topGainer && !weekly.marathon && (
          <div className="hint" style={{ paddingBottom: 12 }}>На этой неделе ещё не сыграно</div>
        )}
      </div>
    </>
  );
}
