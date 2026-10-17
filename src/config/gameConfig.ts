/**
 * Все настраиваемые игровые константы в одном месте. Системы читают их из `game.config`,
 * поэтому баланс меняется правкой этого файла (или передачей частичного переопределения в Game).
 */
export const defaultConfig = {
  world: {
    /** сторона карты в клетках */
    size: 80,
    waterLevel: -0.9,
    /** допуск «ровной» высоты под застройку */
    flatEpsilon: 0.05,
    /** отступ от края карты, где нельзя строить, ед. */
    edgeMargin: 6,
  },
  terrain: {
    flatCenterNear: 14,
    flatCenterFar: 28,
    hillFrequency: 0.045,
    hillThreshold: 0.12,
    hillHeight: 46,
    ringWidth: 11,
    ringBase: 18,
    ringNoise: 26,
    ringExtra: 12,
    riverAmplitude: 0.1,
    riverWidth: 4.2,
    riverCore: 1.2,
    lakeRadius: 0.12,
    waterDepth: 3.4,
  },
  time: {
    /** секунд на игровой день при скорости ×1 */
    dayLength: 2.5,
    /** секунд на полные сутки (день/ночь) */
    todLength: 420,
    startTod: 0.42,
    startYear: 2025,
    daysPerMonth: 30,
    monthsPerYear: 12,
    speeds: [0, 1, 2, 4],
    /** рассвет и закат в долях суток: 0.25 — 06:00, 0.75 — 18:00 */
    sunrise: 0.25,
    sunset: 0.75,
  },
  economy: {
    startMoney: 50000,
    defaultTax: 9,
    maxTax: 25,
    loanStep: 10000,
    maxLoans: 5,
    loanInterest: 0.01,
    stopCost: 250,
    stopUpkeep: 8,
    busUpkeep: 30,
    fare: 1.6,
    /** вклад стоимости земли в налог: base + landValue */
    landTaxBase: 0.5,
    /** доля товаров в доходе коммерции: base + k * goods */
    goodsBase: 0.6,
    goodsK: 0.4,
    historyLength: 36,
    defaultFunding: 1,
    maxFunding: 1.5,
  },
  roads: {
    /** радиус привязки курсора к узлу/дороге, ед. */
    snapRadius: 9,
    /** шаг дискретизации кривой, ед. */
    sampleSpacing: 4,
    /** максимальная длина одного сегмента графа, ед. */
    maxSegmentLength: 40,
    minSegmentLength: 8,
    /** сдвиг привязки к существующему узлу при пересечении, ед. */
    junctionMerge: 7,
    /** множитель отступа дороги от зданий */
    buildingClearance: 0.4,
    /** шаг угловой привязки (Shift), градусы */
    angleSnap: 15,
    /** множитель стоимости моста */
    bridgeCostMul: 3,
    /** ед. длины, считающаяся «одной клеткой» в цене и содержании */
    costUnit: 8,
    /** минимальный угол между дорогами в узле, градусы */
    minJunctionAngle: 18,
    /** период светофора, с, и длительность жёлтого */
    lightCycle: 14,
    lightYellow: 2,
    /** на сколько ед. дальше границы перекрёстка стоп-линия на красный */
    lightStop: 0.5,
    /** расстояние между стоящими в очереди машинами */
    queueGap: 5.5,
    lightCost: 150,
    /** радиус перекрёстка без светофора, где машины мешают друг другу, и штраф к скорости при заторе */
    junctionRadius: 9,
    /** запас к радиусу перекрёстка и дальность резервирования проезда, ед. */
    junctionMargin: 3,
    junctionReserve: 10,
    /** сколько секунд ждать своей очереди, прежде чем въехать (против взаимной блокировки), и когда ждущий начинает блокировать новых */
    junctionPatience: 14,
    junctionStarve: 3,
    /** радиус плавного поворота, ед. */
    turnRadius: 9,
    junctionBusy: 3,
    junctionPenalty: 0.55,
  },
  terraform: {
    /** радиусы кисти, ед. */
    brushSizes: [14, 26, 44],
    defaultBrush: 1,
    /** изменение высоты за одно применение, ед. */
    step: 1.2,
    /** цена за изменённую вершину */
    costPerVertex: 1.5,
    /** не трогаем вершины ближе этого расстояния до дорог, зданий и зон, ед. */
    protect: 8,
    minHeight: -6,
    maxHeight: 40,
    /** при постройке дороги/здания на холме рельеф срезается автоматически */
    autoLevel: true,
  },
  zoning: {
    /** глубина зоны в рядах клеток */
    depth: 3,
    /** радиусы кисти зонирования, ед. */
    brushSizes: [6, 14, 26],
    defaultBrush: 1,
    /** минимальное расстояние между центрами клеток, ед. */
    cellMinGap: 5.5,
    /** минимальный зазор центра клетки до кромки чужой дороги, ед. */
    roadClearance: 3.4,
    /** клетка без дороги дальше этого запаса исчезает, ед. */
    accessSlack: 3,
  },
  growth: {
    spawnInterval: 0.4,
    evalInterval: 1,
    spawnTries: 40,
    minDemand: 0.03,
    spawnPerDemand: 3,
    abandonAfterOutage: 30,
    abandonHappiness: 0.12,
    abandonHappinessChance: 0.05,
    removeAfterAbandon: 25,
    recoverHappiness: 0.3,
    upgradeHappiness: 0.55,
    upgradeDemand: 0.05,
    upgradeChance: 0.05,
    downgradeHappiness: 0.3,
    downgradeLandSlack: 0.12,
    downgradeChance: 0.03,
    happinessSmoothing: 0.4,
    moveInBase: 0.25,
    moveInHappiness: 1.1,
    moveInStep: 0.1,
    emigrateDemand: -0.3,
    emigrateFactor: 0.8,
    goodsDecay: 0.012,
    goodsActivity: 0.3,
  },
  happiness: {
    base: 0.3,
    police: 0.15,
    fire: 0.1,
    health: 0.1,
    park: 0.12,
    education: 0.05,
    transit: 0.08,
    pollution: -0.38,
    noise: -0.18,
    taxFree: 10,
    taxPenalty: 0.02,
    powerOn: 0.12,
    powerOff: -0.22,
    waterOn: 0.1,
    waterOff: -0.22,
    unemployment: -0.3,
    unemploymentPop: 200,
  },
  demand: {
    interval: 0.5,
    smoothing: 0.35,
    taxSlack: 9,
    taxK: 0.045,
    res: { gapK: 1.5, base: 0.3, happinessK: 0.7, minScale: 60 },
    com: { popRatio: 0.28, gapK: 1.6, base: 0.12, minScale: 40 },
    ind: { gapK: 1.3, base: 0.2, minScale: 60, pollutionK: 0.3 },
  },
  stats: {
    interval: 0.5,
    workforceRatio: 0.5,
    educationBonus: 0.1,
    unemploymentMinWorkforce: 5,
    crimeScalePop: 300,
    crimeK: 0.8,
  },
  maps: {
    interval: 0.4,
    maxInterval: 3,
    shoreRadius: 3,
    shoreBonus: 0.1,
    maxFundingEffect: 1.3,
    industryPollutionRadius: 5,
    industryPollution: 0.6,
    noiseRadius: 2.5,
    noisePerCar: 0.03,
    noiseCap: 0.25,
    /** вклад слоёв в стоимость земли */
    landValue: {
      base: 0.27,
      weights: { park: 0.25, police: 0.12, health: 0.1, fire: 0.08, education: 0.1, pollution: -0.5, noise: -0.2 } as Record<string, number>,
    },
  },
  utilities: {
    interval: 0.2,
    maxInterval: 2,
  },
  garbage: {
    /** мусор в секунду на жителя / рабочее место */
    perResident: 0.0016,
    perJob: 0.0024,
    /** вызывать мусоровоз при таком количестве мусора */
    dispatchAt: 16,
    /** предел накопления (дальше — свалка во дворе) */
    cap: 60,
    truckLoad: 110,
    /** радиус, в котором мусоровоз за один заезд забирает мусор у соседних зданий, ед. */
    sweepRadius: 34,
    interval: 2,
    /** при мусоре выше этой доли предела падает счастье */
    unhappyAt: 0.6,
    unhappy: -0.12,
  },
  death: {
    /** смертность в секунду на жителя */
    rate: 0.00002,
    /** во сколько раз здравоохранение снижает смертность при полном покрытии */
    healthEffect: 0.6,
    /** множитель смертности, пока тела не вывезены */
    unburiedBoost: 1.8,
    hearseLoad: 4,
    cap: 8,
    interval: 2,
    unhappy: -0.15,
  },
  crime: {
    interval: 1,
    /** вероятность ограбления в секунду на здание при нулевом покрытии полицией и безработице 0 */
    baseRate: 0.00007,
    /** доля вероятности у самого участка полиции (растёт до 1 на границе радиуса) */
    stationDeterrence: 0.2,
    unemploymentBoost: 2.5,
    policeEffect: 0.9,
    /** добыча за рабочее место / жителя */
    lootPerJob: 2.5,
    lootPerResident: 0.8,
    /** штраф с пойманного преступника */
    fine: 120,
    /** через сколько секунд преступник скрывается, если полиция не приехала */
    timeout: 24,
    maxActive: 3,
    unhappy: -0.1,
  },
  pedestrians: {
    max: 260,
    /** радиус вокруг камеры/игрока, где живут пешеходы, ед. */
    radius: 170,
    spawnPerSecond: 24,
    speed: [1.1, 1.7] as [number, number],
    perResidentNear: 0.35,
    /** пешеходы видны, если камера ближе этого расстояния */
    visibleZoom: 300,
  },
  fp: {
    eyeHeight: 1.7,
    walk: 6,
    run: 14,
    radius: 0.55,
    sensitivity: 0.0022,
    fov: 70,
  },
  traffic: {
    maxVehicles: 160,
    /** машин на жителя (верхняя граница числа легковых при данном населении) */
    carsPerPop: 0.07,
    /** длина машин по видам и зазор между ними, ед. */
    length: { car: 3.6, truck: 5.4, bus: 7.2, police: 3.8, garbage: 5.4, hearse: 4.4 } as Record<string, number>,
    gap: 1.8,
    busExtra: 40,
    tripsPerPop: 0.0016,
    rushBase: 0.5,
    rushAmp: 0.9,
    rushMorning: 0.33,
    rushEvening: 0.72,
    rushWidth: 0.06,
    minPopulation: 15,
    shopShare: 0.35,
    congestionPower: 2.2,
    /** нижняя граница скорости потока при пробке (чтобы не было вечных заторов) */
    minFlow: 0.3,
    /** через сколько секунд застрявшая машина исчезает */
    maxAge: 150,
    /** ед. длины дороги на одну «ячейку» вместимости */
    vehicleSpacing: 5,
    dwell: [3, 12] as [number, number],
    truckRate: 1.2,
    truckPerIndustry: 0.05,
    goodsPerTruck: 0.4,
    maxPendingPaths: 40,
    occupancySync: 0.5,
    flowSmoothing: 0.5,
    offsetDecay: 7,
    speedMul: { car: [0.9, 1.1], truck: [0.8, 0.8], bus: [0.85, 0.85], police: [1, 1], garbage: [0.8, 0.8], hearse: [0.85, 0.85] } as Record<string, [number, number]>,
  },
  transit: {
    /** радиус охвата остановки, клеток */
    stopRadius: 6,
    busCapacity: 30,
    busWait: 2.4,
    /** пассажиров в секунду на жителя в зоне остановки при полном спросе */
    demandPerResident: 0.0018,
    /** предел очереди на остановке */
    maxWaiting: 120,
    /** целевой интервал между автобусами маршрута, с */
    headway: 70,
    maxBusesPerRoute: 8,
    /** пауза между выпусками автобусов из депо, с */
    spawnInterval: 7,
    shareMax: 0.5,
    shareFactor: 0.55,
    stopMergeDistance: 10,
    /** привязка точки маршрута к остановке, ед. */
    routeSnap: 14,
    /** доли целей поездки по времени суток: утро / день / вечер / ночь */
    purposeMix: {
      morning: { work: 0.7, shop: 0.1, home: 0.2 },
      day: { work: 0.25, shop: 0.45, home: 0.3 },
      evening: { work: 0.1, shop: 0.25, home: 0.65 },
      night: { work: 0.05, shop: 0.1, home: 0.85 },
    } as Record<string, Record<string, number>>,
    routeColors: [0xe8a21a, 0x2f9bd9, 0xd9534f, 0x5cb85c, 0xb36bd1, 0x20c9b4, 0xe6679c, 0x9aa5b1],
  },
  disasters: {
    enabled: true,
    firePerMonth: 0.22,
    minBuildings: 14,
    interval: 0.5,
    extinguishBase: 0.04,
    extinguishCoverage: 0.7,
    spreadCoverage: 0.35,
    spreadChance: 0.05,
    spreadDistance: 12,
    burnTime: 16,
  },
  save: {
    key: 'citysim3d.save.v2',
    autosaveMonths: 3,
  },
  camera: {
    fov: 42,
    minDistance: 35,
    maxDistance: 620,
    startDistance: 190,
    panSpeed: 1.1,
    rotateSpeed: 1.6,
    smoothing: 10,
    zoomStep: 1.12,
  },
  render: {
    shadowSize: 2048,
    exposure: 0.9,
    treeLimit: 9000,
    alertLimit: 70,
    /** число вариантов внешнего вида на уровень зоны */
    zoneVariants: 18,
  },
  audio: {
    master: 0.8,
    ambient: 0.7,
    sfx: 0.8,
    music: 0.35,
    storageKey: 'citysim3d.audio.v1',
  },
};

export type GameConfig = typeof defaultConfig;
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends readonly unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/** Глубокое слияние переопределений поверх конфигурации по умолчанию (без мутации исходников). */
export function mergeConfig(over?: DeepPartial<GameConfig>): GameConfig {
  const clone = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.slice();
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
    return v;
  };
  const base = clone(defaultConfig) as Record<string, unknown>;
  const apply = (target: Record<string, unknown>, src: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(src)) {
      const cur = target[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) apply(cur as Record<string, unknown>, v as Record<string, unknown>);
      else if (v !== undefined) target[k] = clone(v);
    }
  };
  if (over) apply(base, over as Record<string, unknown>);
  return base as GameConfig;
}
