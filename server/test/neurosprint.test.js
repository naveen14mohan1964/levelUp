const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getSprintPack, CURATED_PACKS } = require('../src/neurosprint');

describe('neurosprint engine', () => {
  test('curated cache pack returns all 5 neuro-phases with strict constraints', async () => {
    const pack = await getSprintPack({ title: 'Distributed Caching and Invalidation', learn: 'Redis cache TTL stampede' });
    assert.equal(pack.source, 'curated');
    // Phase 1: Trap
    assert.ok(pack.trap.question.length > 10);
    assert.equal(pack.trap.options.length, 3);
    assert.ok(pack.trap.shockFact.length > 15);
    // Phase 2: Monochunks
    assert.equal(pack.monochunks.length, 3);
    for (const c of pack.monochunks) {
      assert.ok(c.text.split(/\s+/).length <= 40, `Chunk exceeds 40 words: ${c.text}`);
      assert.ok(c.anchor.length > 5);
    }
    // Phase 3: Simulation
    assert.ok(pack.simulation.title);
    assert.ok(pack.simulation.sliderLabel);
    assert.ok(pack.simulation.toggleLabel);
    // Phase 4: Junior PR Review
    assert.ok(pack.prReview.juniorComment);
    assert.ok(pack.prReview.code);
    assert.equal(pack.prReview.mitigationChoices.length, 2);
    // Phase 5: Takeaway
    assert.ok(pack.takeaway.length > 10);
  });

  test('curated two-way doors pack matches judgement lessons', async () => {
    const pack = await getSprintPack({ title: 'One-Way Doors and Two-Way Doors', learn: 'Reversible architectural decisions' });
    assert.equal(pack.source, 'curated');
    assert.equal(pack.simulation.kind, 'decision');
    assert.equal(pack.trap.correctIndex, 1);
  });

  test('fallback generator handles arbitrary unknown topics cleanly', async () => {
    const pack = await getSprintPack({ title: 'Quantum Flux Optimization' });
    assert.ok(pack.trap.question.includes('Quantum Flux Optimization'));
    assert.equal(pack.monochunks.length, 3);
    assert.ok(pack.simulation);
    assert.ok(pack.prReview);
  });
});
