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
    todLength: 110,
    startTod: 0.42,
    startYear: 2025,
    daysPerMonth: 30,
    monthsPerYear: 12,
    speeds: [0, 1, 2, 4],
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
    buildingClearance: 0.8,
    /** шаг угловой привязки (Shift), градусы */
    angleSnap: 15,
    /** множитель стоимости моста */
    bridgeCostMul: 3,
    /** ед. длины, считающаяся «одной клеткой» в цене и содержании */
    costUnit: 8,
    /** минимальный угол между дорогами в узле, градусы */
    minJunctionAngle: 18,
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
  traffic: {
    maxVehicles: 420,
    busExtra: 40,
    tripsPerPop: 0.0045,
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
    speedMul: { car: [0.9, 1.1], truck: [0.8, 0.8], bus: [0.85, 0.85] } as Record<string, [number, number]>,
  },
  transit: {
    stopRadius: 6,
    maxBusesPerGroup: 6,
    busWait: 2.2,
    shareMax: 0.5,
    shareFactor: 0.55,
    ridersPerPop: 0.04,
    maxRidersPerStop: 30,
    stopMergeDistance: 10,
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
