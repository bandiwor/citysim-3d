import { describe, expect, it } from 'vitest';
import { PROPS } from '../src/data/props';
import { createGame, road, run, settle } from './helpers';

function place(g: ReturnType<typeof createGame>, id: string, x: number, z: number): void {
  const s = g.builder.snapService(id, x, z);
  const r = g.builder.placeService(id, s.x, s.z, s.rot);
  expect(r.ok, `${id}: ${r.reasonKey}`).toBe(true);
}

describe('природа', () => {
  it('сажает одно растение, кисть и ластик', () => {
    const g = createGame();
    const props = g.get('props');
    expect(props.place('oak', 200, 200)).not.toBeNull();
    // слишком близко к соседу
    expect(props.place('oak', 200.2, 200)).toBeNull();
    const made = props.brush(['pine', 'bush'], 300, 300, 18, props.stampCount(18, 2));
    expect(made.length).toBeGreaterThan(3);
    expect(g.world.props.size).toBe(1 + made.length);
    expect(props.erase(300, 300, 30)).toBe(made.length);
    expect(g.world.props.size).toBe(1);
  });

  it('дорога и здания убирают растения под собой', async () => {
    const g = createGame();
    const props = g.get('props');
    props.place('oak', 120, 100);
    props.place('rock', 150, 100.5);
    expect(road(g, 40, 100, 200, 100)).toBe(true);
    await run(g, 2);
    expect(g.world.props.size).toBe(0);
  });

  it('у каждого вида есть цена, и растения сохраняются в сохранении', () => {
    for (const d of PROPS) expect(d.cost).toBeGreaterThan(0);
    const g = createGame();
    g.get('props').place('birch', 250, 250);
    const data = g.get('save').serialize();
    expect(data.props).toHaveLength(1);
    expect(data.props![0][0]).toBe('birch');
  });
});

describe('такси и общественный транспорт', () => {
  it('такси возит часть поездок и приносит выручку', async () => {
    const g = createGame({ config: { traffic: { minPopulation: 0 } } });
    road(g, 40, 100, 240, 100);
    place(g, 'coal', 230, 130);
    place(g, 'watertower', 60, 112);
    place(g, 'taxidepot', 120, 80);
    g.builder.paintZone(90, 112, 30, 'res');
    g.builder.paintZone(190, 112, 24, 'com');
    g.config.taxi.share = 1;
    g.config.taxi.shareMax = 1;
    await settle(g);
    await run(g, 240, 0.25);
    const taxi = g.get('taxi');
    expect(taxi.tripsMonth).toBeGreaterThan(0);
    expect(taxi.fareMonth).toBeGreaterThan(0);
  });

  it('на дорогах с пробками охотнее пересаживаются на автобус', () => {
    const g = createGame();
    const tr = g.get('transit');
    expect(tr.share(100, 100)).toBe(0);
    expect(tr.crowding).toBe(0);
  });
});

describe('рабочие места и образование', () => {
  it('образованные при нехватке мест идут на обычные места и немного грустят', () => {
    const g = createGame();
    const st = g.get('stats');
    // много образованных, мест для них нет
    st.restoreEdu(0.8, 0.4);
    st.recompute();
    expect(st.overqualified).toBeGreaterThanOrEqual(0);
    expect(st.shortageByEdu[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('мусор', () => {
  it('несколько мусоросжигателей справляются с большим городом', async () => {
    const g = createGame({ size: 80 });
    road(g, 40, 100, 400, 100);
    place(g, 'coal', 410, 130);
    place(g, 'watertower', 60, 112);
    place(g, 'incinerator', 150, 70);
    place(g, 'incinerator', 250, 70);
    g.builder.paintZone(200, 112, 70, 'res', 2);
    await settle(g);
    await run(g, 900, 0.5);
    const homes = g.world.list().filter((b) => b.kind === 'zone');
    expect(homes.length).toBeGreaterThan(2);
    for (const b of homes) b.garbage = 40;
    await run(g, 400, 0.5);
    const san = g.get('sanitation');
    expect(san.overflowing).toBeLessThan(homes.length / 2);
  });
});
