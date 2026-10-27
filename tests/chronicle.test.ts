import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { AXIS_FUTURE_YEARS, BIG_BANG, capabilitiesAt, dateToYear, decimalYear, eraAt, fromAxis, interpolateMetric, kardashev, timeLabel, toAxis, yearToDate, type ChronicleEra, type ChronicleMetric, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { beijingDayEnd } from "@aihot/contracts/time";

const now = 2026.75;
test("symlog endpoints, inverse and monotonicity", () => {
  assert.equal(toAxis(BIG_BANG, now), 0);
  assert.equal(toAxis(now + AXIS_FUTURE_YEARS, now), 1);
  assert.equal(fromAxis(0, now), BIG_BANG);
  assert.equal(fromAxis(1, now), now + AXIS_FUTURE_YEARS);
  assert.equal(fromAxis(-1, now), BIG_BANG);
  assert.equal(fromAxis(2, now), now + AXIS_FUTURE_YEARS);
  const times = [BIG_BANG, -1e9, -1e6, -10000, 0, 1769, now - .01, now, now + .01, now + 100];
  let previous = -1;
  for (const t of times) {
    const u = toAxis(t, now);
    assert.ok(u > previous);
    previous = u;
    // At geological scales a double's ULP is already larger than 1e-9 years.
    assert.ok(Math.abs(fromAxis(u, now) - t) <= Math.max(1e-9, Math.abs(t) * Number.EPSILON * 64), String(t));
  }
  for (let i = 0; i <= 100; i++) {
    const u = i / 100;
    assert.ok(Math.abs(toAxis(fromAxis(u, now), now) - u) < 1e-9);
  }
});

test("metrics interpolate geometrically and never invent a forecast", () => {
  const points: Array<[number, number]> = [[2000, 100], [2020, 10000]];
  assert.equal(interpolateMetric([], 2000, now), null);
  assert.equal(interpolateMetric(points, 1999, now), null);
  assert.equal(interpolateMetric(points, 2025, now), 10000);
  assert.equal(interpolateMetric(points, 2020, now), 10000);
  assert.equal(interpolateMetric(points, 2010, now), 1000);
  assert.equal(interpolateMetric(points, 2040, now), null);
  const projection: Array<[number, number]> = [[2020, 100], [2040, 10000]];
  assert.equal(interpolateMetric(projection, 2030, now), null);
  assert.equal(interpolateMetric(projection, 2030, now, 2025), 1000);
  assert.equal(interpolateMetric(projection, 2040, now, 2025), 10000);
  assert.equal(interpolateMetric(projection, 2041, now, 2025), null);
  assert.equal(interpolateMetric(points, NaN, now), null);
  assert.equal(kardashev(1e16), 1);
});

test("labels, calendar round trips and Beijing day end", () => {
  assert.equal(timeLabel(BIG_BANG, now), "138亿年前");
  assert.equal(timeLabel(-3200, now), "公元前3201年");
  assert.equal(timeLabel(dateToYear("1969-07-20"), now, "day", "1969-07-20"), "1969年7月20日");
  for (const date of ["0001-01-01", "0099-12-31", "1900-03-01", "1969-07-20", "2000-02-29", "2026-09-01", "9999-12-31"]) assert.equal(yearToDate(dateToYear(date)), date);
  for (const t of [BIG_BANG, 0, 10000, NaN, Infinity]) assert.equal(yearToDate(t), null);
  assert.equal(beijingDayEnd("2026-09-01").toISOString(), "2026-09-01T15:59:59.999Z");
});

const files = ["eras", "milestones", "metrics"].map((name) => new URL(`../industry/chronicle/${name}.json`, import.meta.url));
const missing = files.filter((file) => !existsSync(file));
if (missing.length) {
  console.log(`Skipping real chronicle data: missing ${missing.map(String).join(", ")}`);
  test.skip("real chronicle data (files not supplied)", () => {});
} else {
  const eras = JSON.parse(readFileSync(files[0]!, "utf8")).eras as ChronicleEra[];
  const milestones = JSON.parse(readFileSync(files[1]!, "utf8")).milestones as ChronicleMilestone[];
  const metrics = JSON.parse(readFileSync(files[2]!, "utf8")).series as ChronicleMetric[];
  const http = (url: string) => assert.match(url, /^https?:\/\/[^\s]+$/);
  const unique = (ids: string[]) => assert.equal(new Set(ids).size, ids.length);
  test("real eras are ordered with unique safe plate ids", () => {
    unique(eras.map((e) => e.id));
    assert.ok(eras.length);
    eras.forEach((era, i) => {
      assert.match(era.art, /^[a-z0-9-]+$/);
      assert.ok(Number.isFinite(era.from));
      if (i) assert.ok(era.from > eras[i - 1]!.from, era.id);
      if (era.forecast) assert.ok(era.from > decimalYear(Date.now()), era.id);
      assert.equal(eraAt(eras, era.from)?.id, era.id);
    });
  });
  test("every plate the data names is on disk at both widths", () => {
    const plate = (dir: string, slug: string) => {
      assert.match(slug, /^[a-z0-9-]+$/);
      for (const w of [800, 1600]) assert.ok(existsSync(new URL(`../apps/web/public/media/art/${dir}/${slug}-${w}.webp`, import.meta.url)), `${dir}/${slug}-${w}`);
    };
    eras.forEach((era) => plate("epochs", era.art));
    milestones.filter((m) => m.art).forEach((m) => {
      plate("moments", m.art!);
      assert.ok(m.artStyle, m.id);
    });
  });
  test("real milestones have ordered dates, sources and attributable future forecasts", () => {
    unique(milestones.map((m) => m.id));
    milestones.forEach((m, i) => {
      assert.ok(Number.isFinite(m.t), m.id);
      if (i) assert.ok(m.t >= milestones[i - 1]!.t, m.id);
      http(m.source);
      assert.ok(["ga", "ma", "ka", "year", "month", "day"].includes(m.precision), m.id);
      if (m.t > decimalYear(Date.now())) assert.ok(m.forecast, m.id);
      if (m.forecast) {
        assert.ok(m.forecast.by, m.id);
        http(m.forecast.url);
        assert.ok(m.t > decimalYear(Date.now()), m.id);
      }
      if (m.precision === "year" && m.t >= 1) {
        assert.match(m.date ?? "", /^\d{4}$/);
        assert.equal(Number(m.date), Math.floor(m.t), m.id);
      } else if (m.precision === "month" || m.precision === "day") {
        assert.match(m.date ?? "", m.precision === "day" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/);
        const start = decimalYear(`${m.date}${m.precision === "month" ? "-01" : ""}T00:00:00Z`);
        // Curated decimal dates are rounded to four decimals (at most ~27 minutes).
        if (m.precision === "day") assert.ok(Math.abs(m.t - start) <= .000051, m.id);
        else {
          const [year, month] = m.date!.split("-").map(Number);
          const approximateMonth = year! + (month! - 1) / 12;
          assert.ok(Math.abs(m.t - approximateMonth) <= .000051 || (m.t >= start - .000051 && m.t < start + 1 / 12 + .003), m.id);
        }
      } else if (m.t < 1 && m.precision === "year") {
        assert.equal(m.date, undefined, m.id);
        assert.equal(m.t, Math.floor(m.t), m.id);
      }
    });
    assert.ok(capabilitiesAt(milestones, now).held.every((m) => !m.forecast && m.t <= now));
  });
  test("real metric points are positive, finite, ordered and sourced", () => {
    unique(metrics.map((m) => m.key));
    assert.deepEqual(metrics.map((m) => m.key), ["population", "energy", "compute", "messaging", "travel"]);
    for (const m of metrics) {
      http(m.source.url);
      assert.ok(m.source.name);
      assert.ok(m.points.length);
      m.points.forEach(([t, v], i) => {
        assert.ok(Number.isFinite(t) && Number.isFinite(v) && v > 0, m.key);
        if (i) assert.ok(t > m.points[i - 1]![0], m.key);
      });
      if (m.points.at(-1)![0] > decimalYear(Date.now())) assert.notEqual(m.forecastFrom, undefined, m.key);
      if (m.forecastFrom !== undefined) assert.ok(m.forecastFrom <= m.points.at(-1)![0]);
    }
  });

  test("the English edition covers every era, milestone and metric in English", async () => {
    const { loadChronicle } = await import("../packages/backend/src/publication/chronicle.ts");
    const english = loadChronicle("en");
    const han = /\p{Script=Han}/u;
    for (const era of english.eras) for (const text of [era.title, era.summary, era.artStyle, era.epoch ?? ""]) assert.doesNotMatch(text, han, era.id);
    for (const m of english.milestones) for (const text of [m.title, m.detail, m.capability ?? "", m.artStyle ?? "", m.forecast?.by ?? ""]) assert.doesNotMatch(text, han, m.id);
    for (const m of english.metrics) for (const text of [m.label, m.unit, m.note, m.source.name]) assert.doesNotMatch(text, han, m.key);
    assert.deepEqual(english.milestones.map((m) => [m.id, m.t, m.source]), milestones.map((m) => [m.id, m.t, m.source]), "only reader text changes");
    assert.equal(loadChronicle("zh").eras[0]!.title, eras[0]!.title);
  });
}
