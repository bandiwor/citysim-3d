import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import type { System } from '../core/System';

declare module '../core/Game' {
  interface SystemMap {
    weather: WeatherSystem;
  }
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'heat' | 'fog';
export const WEATHER_KINDS: WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'heat', 'fog'];

/** Влияние сезона и погоды через модификаторы (ключи читают другие системы). */
const SEASON_FX: Record<Season, { mul?: Record<string, number>; add?: Record<string, number> }> = {
  winter: { mul: { powerDemand: 1.15, tourism: 0.6, disease: 1.15 }, add: { happiness: -0.01 } },
  spring: { mul: { tourism: 1.1 }, add: { happiness: 0.01 } },
  summer: { mul: { waterDemand: 1.12, tourism: 1.3 } },
  autumn: { mul: { tourism: 0.9 } },
};
const WEATHER_FX: Record<WeatherKind, { mul?: Record<string, number>; add?: Record<string, number> }> = {
  clear: { mul: { tourism: 1.1 } },
  cloudy: {},
  rain: { mul: { fire: 0.5, tourism: 0.8, transitShare: 1.15, waterDemand: 0.9 }, add: { happiness: -0.01 } },
  storm: { mul: { fire: 0.4, tourism: 0.55, transitShare: 1.25 }, add: { happiness: -0.02 } },
  snow: { mul: { fire: 0.7, tourism: 0.85, transitShare: 1.2, powerDemand: 1.08 } },
  heat: { mul: { waterDemand: 1.3, powerDemand: 1.12, fire: 1.6, death: 1.1, tourism: 1.15 }, add: { happiness: -0.015 } },
  fog: { mul: { tourism: 0.9 } },
};
const ICONS: Record<WeatherKind, string> = { clear: '☀️', cloudy: '☁️', rain: '🌧️', storm: '⛈️', snow: '🌨️', heat: '🥵', fog: '🌫️' };

/**
 * Сезоны и погода. Времена года идут по календарю, погода меняется раз в несколько дней по вероятностям сезона.
 * Влияет на спрос энергии и воды, пожары, болезни, счастье, туризм и долю общественного транспорта (модификаторы),
 * а также на вид города: дождь, снег и снежный покров, туман, пасмурный свет.
 */
export class WeatherSystem implements System {
  readonly id = 'weather';
  readonly order = 2;
  kind: WeatherKind = 'clear';
  /** дней до смены погоды */
  daysLeft = 3;
  /** снежный покров 0..1 (копится во время снегопада, тает при плюсе) */
  snow = 0;
  /** сила осадков/облачности 0..1 — плавно, чтобы не было рывков на смене */
  intensity = 0;
  private _rng = new Rng(1);
  private _game!: Game;
  private _season: Season | null = null;

  init(game: Game): void {
    this._game = game;
    this._rng = new Rng(game.world.seed * 31 + 7);
    game.bus.on('time:day', () => this._day());
    this._applySeason();
    this._applyWeather();
  }

  season(): Season {
    const m = this._game.get('time').month;
    return m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  }

  icon(kind = this.kind): string {
    return ICONS[kind];
  }

  /** Температура воздуха сейчас, °C: сезон + погода + суточный ход. */
  temperature(): number {
    const g = this._game;
    const base = g.config.weather.seasonTemp[this.season()];
    const tod = g.get('time').tod;
    const daily = Math.sin((tod - 0.3) * Math.PI * 2) * 4;
    const w = { clear: 1, cloudy: -1, rain: -3, storm: -4, snow: -3, heat: 9, fog: -1 }[this.kind];
    return Math.round(base + daily + w);
  }

  /** Идут осадки (для звука и частиц): 0..1. */
  precipitation(): number {
    return this.kind === 'rain' || this.kind === 'storm' || this.kind === 'snow' ? this.intensity : 0;
  }

  update(dt: number): void {
    const want = this.kind === 'storm' ? 1 : this.kind === 'rain' || this.kind === 'snow' ? 0.75 : this.kind === 'cloudy' || this.kind === 'fog' ? 0.45 : 0;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.25);
    const c = this._game.config.weather;
    if (this.kind === 'snow') this.snow = Math.min(1, this.snow + dt * c.snowRate * this.intensity);
    else if (this.temperature() > 1) this.snow = Math.max(0, this.snow - dt * c.meltRate * (this.kind === 'rain' ? 2 : 1));
  }

  /** Принудительно сменить погоду (события, тесты). */
  set(kind: WeatherKind, days = 3): void {
    this.kind = kind;
    this.daysLeft = days;
    this._applyWeather();
    this._game.bus.emit('weather:changed', kind);
  }

  private _day(): void {
    const s = this.season();
    if (s !== this._season) this._applySeason();
    if (--this.daysLeft > 0) return;
    const c = this._game.config.weather;
    const table = c.chances[s];
    let r = this._rng.next() * Object.values(table).reduce((a, b) => a + b, 0);
    let next: WeatherKind = 'clear';
    for (const [k, p] of Object.entries(table)) {
      r -= p;
      if (r <= 0) {
        next = k as WeatherKind;
        break;
      }
    }
    const days = c.spellDays[0] + Math.floor(this._rng.next() * (c.spellDays[1] - c.spellDays[0] + 1));
    const was = this.kind;
    this.set(next, days);
    if (next !== was && (next === 'storm' || next === 'heat' || next === 'snow')) this._game.message(`msg.weather.${next}`, undefined, next === 'snow' ? 'info' : 'warn');
  }

  private _applySeason(): void {
    const s = this.season();
    const announce = this._season !== null;
    this._season = s;
    // снегопад вне зимы не бывает
    if (s !== 'winter' && this.kind === 'snow') this.kind = 'rain';
    if (s === 'winter' && this.kind === 'heat') this.kind = 'clear';
    this._game.get('mods').put({ id: 'season', icon: { winter: '❄️', spring: '🌱', summer: '🌞', autumn: '🍂' }[s], nameKey: `season.${s}`, until: null, ...SEASON_FX[s] });
    if (announce) this._game.message(`msg.season.${s}`, undefined, 'info');
  }

  private _applyWeather(): void {
    const fx = WEATHER_FX[this.kind];
    if (!fx.mul && !fx.add) this._game.get('mods').remove('weather');
    else this._game.get('mods').put({ id: 'weather', icon: ICONS[this.kind], nameKey: `weather.${this.kind}`, until: null, ...fx });
  }

  saveState(): unknown {
    return { k: this.kind, d: this.daysLeft, s: Math.round(this.snow * 100) / 100 };
  }

  loadState(data: unknown): void {
    const d = data as { k?: WeatherKind; d?: number; s?: number } | null;
    if (!d) return;
    if (d.k && WEATHER_KINDS.includes(d.k)) this.kind = d.k;
    this.daysLeft = d.d ?? 3;
    this.snow = d.s ?? 0;
    this._applySeason();
    this._applyWeather();
  }
}
