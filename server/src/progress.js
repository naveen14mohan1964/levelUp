// Links the plan's "solve the problems" tasks to the problems themselves, so DSA progress follows your
// real solves (LeetCode sync or manual ticks) instead of a separate checkbox:
//   study day    -> the 'practice' task ("LeetCode block…") is done when every core problem is solved
//   self-test day -> the 'selftest' task is done when every self-test problem is solved
// Stretch problems never block a task. Run it after anything that changes a problem's status.
const { sql } = require('./db');

// Which problems each linked task kind stands for.
const LINKED = `
  (t.kind = 'practice' AND p.is_stretch = 0 AND p.is_selftest = 0) OR
  (t.kind = 'selftest' AND p.is_selftest = 1)`;

/** Re-derives the linked tasks (all days, or just `dayId`). Returns how many tasks changed. */
async function linkProblemTasks(pool, dayId = null) {
  const r = await pool.request().input('day', sql.Int, dayId).query(`
    WITH x AS (
      SELECT t.id,
        CASE WHEN COUNT(p.id) > 0 AND SUM(CASE WHEN p.status = 'todo' THEN 1 ELSE 0 END) = 0 THEN 1 ELSE 0 END AS complete,
        MAX(p.solved_at) AS last_solved
      FROM dbo.tasks t
      JOIN dbo.problems p ON p.day_id = t.day_id AND (${LINKED})
      WHERE t.kind IN ('practice', 'selftest') AND (@day IS NULL OR t.day_id = @day)
      GROUP BY t.id
    )
    UPDATE t SET done = x.complete,
                 done_at = CASE WHEN x.complete = 1 THEN COALESCE(x.last_solved, SYSUTCDATETIME()) END
    FROM dbo.tasks t JOIN x ON x.id = t.id
    WHERE t.done <> x.complete;
    SELECT @@ROWCOUNT AS changed;`);
  return r.recordset[0]?.changed || 0;
}

/** True if this task's tick comes from its problems (the UI shows it read-only). */
async function isLinkedTask(pool, taskId) {
  const r = await pool.request().input('id', sql.Int, taskId).query(`
    SELECT TOP 1 1 AS linked FROM dbo.tasks t
    JOIN dbo.problems p ON p.day_id = t.day_id AND (${LINKED})
    WHERE t.id = @id AND t.kind IN ('practice', 'selftest')`);
  return r.recordset.length > 0;
}

/** Adds `linked` (and the problems it counts) to one day's tasks, given that day's problems. */
function markLinked(tasks, problems) {
  const of = {
    practice: problems.filter((p) => !p.is_stretch && !p.is_selftest),
    selftest: problems.filter((p) => p.is_selftest),
  };
  return tasks.map((t) => {
    const list = of[t.kind] || [];
    if (!list.length) return { ...t, linked: false };
    return { ...t, linked: true, solved: list.filter((p) => p.status !== 'todo').length, total: list.length };
  });
}

module.exports = { linkProblemTasks, isLinkedTask, markLinked };
