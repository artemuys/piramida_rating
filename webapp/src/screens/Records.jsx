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
  const { toastError } = useApp();
  const [data, setData] = useState(null);

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
        <div className="s-sect" style={{ color: "#FFD60A" }}>⚡ Все времена</div>
        {allTime.bestStreak && (
          <RecordRow
            icon="🔥" label="Серийный победитель"
            desc="Самая длинная серия побед подряд за всё время"
            value={`${allTime.bestStreak.count} подряд`}
            sub={allTime.bestStreak.name}
            onPress={() => go(allTime.bestStreak.id, allTime.bestStreak.name)}
          />
        )}
        {allTime.peakElo && (
          <RecordRow
            icon="👑" label="Исторический пик"
            desc="Наивысший рейтинг ELO, когда-либо достигнутый игроком"
            value={`${allTime.peakElo.elo} эло`}
            sub={allTime.peakElo.name}
            onPress={() => go(allTime.peakElo.id, allTime.peakElo.name)}
          />
        )}
        {allTime.veteran && (
          <RecordRow
            icon="💼" label="Ветеран клуба"
            desc="Больше всего сыгранных матчей за всё время"
            value={`${allTime.veteran.count} матчей`}
            sub={allTime.veteran.name}
            onPress={() => go(allTime.veteran.id, allTime.veteran.name)}
          />
        )}
        {allTime.derby && (
          <RecordRow
            icon="🤝" label="Вечное дерби"
            desc="Самое частое противостояние двух игроков в клубе"
            value={`${allTime.derby.count} матчей`}
            sub={allTime.derby.playerA.name}
            onPress={() => go(allTime.derby.playerA.id, allTime.derby.playerA.name)}
            secondLabel={allTime.derby.playerB.name}
            onPressSecond={() => go(allTime.derby.playerB.id, allTime.derby.playerB.name)}
          />
        )}
        {allTime.boss && (
          <RecordRow
            icon="🦖" label="Непобедимый босс"
            desc="Лучший процент побед (учитываются игроки от 20 матчей)"
            value={`${allTime.boss.winRate}%`}
            sub={allTime.boss.name}
            onPress={() => go(allTime.boss.id, allTime.boss.name)}
          />
        )}
        {allTime.upset && (
          <RecordRow
            icon="🏹" label="Величайший апсет"
            desc="Самая большая победа над более сильным соперником по ELO"
            value={`+${allTime.upset.diff} эло`}
            sub={allTime.upset.winnerName}
            onPress={() => go(allTime.upset.winnerId, allTime.upset.winnerName)}
            secondLabel={allTime.upset.loserName}
            onPressSecond={() => go(allTime.upset.loserId, allTime.upset.loserName)}
          />
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#FF9F0A" }}>📅 Этот месяц</div>
        {monthly.mostMatches && (
          <RecordRow
            icon="🎯" label="Самый активный"
            desc="Больше всего матчей сыграно в этом месяце"
            value={`${monthly.mostMatches.count} игр`}
            sub={monthly.mostMatches.name}
            onPress={() => go(monthly.mostMatches.id, monthly.mostMatches.name)}
          />
        )}
        {monthly.topGainer && (
          <RecordRow
            icon="📈" label="Гроза месяца"
            desc="Наибольший прирост ELO за текущий месяц"
            value={`+${monthly.topGainer.gain} эло`}
            sub={monthly.topGainer.name}
            onPress={() => go(monthly.topGainer.id, monthly.topGainer.name)}
          />
        )}
        {monthly.topDonor && (
          <RecordRow
            icon="📉" label="Главный донор"
            desc="Наибольшая потеря ELO за текущий месяц"
            value={`${monthly.topDonor.loss} эло`}
            sub={monthly.topDonor.name}
            onPress={() => go(monthly.topDonor.id, monthly.topDonor.name)}
          />
        )}
        {monthly.topHunter && (
          <RecordRow
            icon="⚔️" label="Охотник за головами"
            desc="Сыграл с наибольшим числом разных соперников в этом месяце"
            value={`${monthly.topHunter.count} соперников`}
            sub={monthly.topHunter.name}
            onPress={() => go(monthly.topHunter.id, monthly.topHunter.name)}
          />
        )}
        {!monthly.mostMatches && !monthly.topGainer && (
          <div className="hint" style={{ paddingBottom: 12 }}>Матчи в этом месяце ещё не сыграны</div>
        )}
      </div>

      <div className="card">
        <div className="s-sect" style={{ color: "#30D158" }}>🚀 Эта неделя</div>
        {weekly.topGainer && (
          <RecordRow
            icon="⚡" label="Быстрый рост"
            desc="Наибольший прирост ELO за текущую неделю"
            value={`+${weekly.topGainer.gain} эло`}
            sub={weekly.topGainer.name}
            onPress={() => go(weekly.topGainer.id, weekly.topGainer.name)}
          />
        )}
        {weekly.marathon && (
          <RecordRow
            icon="🎰" label="Марафон недели"
            desc="Больше всего матчей сыграно на этой неделе"
            value={`${weekly.marathon.count} матчей`}
            sub={weekly.marathon.name}
            onPress={() => go(weekly.marathon.id, weekly.marathon.name)}
          />
        )}
        {!weekly.topGainer && !weekly.marathon && (
          <div className="hint" style={{ paddingBottom: 12 }}>На этой неделе ещё не сыграно</div>
        )}
      </div>
    </>
  );
}
