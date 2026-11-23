import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseAls, beatToSec } from '../src/ableton.js';

const set = (locators, tempo = '', extra = '') => zlib.gzipSync(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" Creator="Ableton Live 11.3"><LiveSet>
<Tracks><AudioTrack Id="8"><Name><EffectiveName Value="Click" /></Name></AudioTrack><AudioTrack Id="9"><Name><EffectiveName Value="Guide" /></Name></AudioTrack></Tracks>
<MasterTrack><AutomationEnvelopes><Envelopes>${tempo}</Envelopes></AutomationEnvelopes>
<DeviceChain><Mixer><Tempo><LomId Value="0" /><Manual Value="72" /><AutomationTarget Id="8"><LockEnvelope Value="0" /></AutomationTarget></Tempo>
<TimeSignature><AutomationTarget Id="9" /></TimeSignature></Mixer></DeviceChain></MasterTrack>
<Locators><Locators>${locators}</Locators></Locators>
<TimeSignatures><RemoteableTimeSignature Id="0"><Numerator Value="6" /><Denominator Value="8" /><Time Value="0" /></RemoteableTimeSignature></TimeSignatures>${extra}
</LiveSet></Ableton>`));
const loc = (t, n) => `<Locator Id="${t}"><LomId Value="0" /><Time Value="${t}" /><Name Value="${n}" /><Annotation Value="" /><IsSongStart Value="false" /></Locator>`;

test('Ableton set: markers in seconds, tempo, time signature, track names', () => {
  const r = parseAls(set(loc(16, 'Verse 1') + loc(0, 'Intro') + loc(48, 'Chorus &amp; Tag')));
  assert.equal(r.bpm, 72); assert.equal(r.beats, 6); assert.equal(r.unit, 8);
  assert.deepEqual(r.markers.map(m => [m.name, m.sec]), [['Intro', 0], ['Verse 1', 13.333], ['Chorus & Tag', 40]]);
  assert.deepEqual(r.tracks, ['Click', 'Guide']);
  assert.deepEqual(parseAls(set('')).markers, [], 'no markers is fine');
});

test('tempo changes: a jump and a straight ramp', () => {
  const env = `<AutomationEnvelope Id="0"><EnvelopeTarget><PointeeId Value="8" /></EnvelopeTarget><Automation><Events>
    <FloatEvent Id="1" Time="-63072000" Value="60" /><FloatEvent Id="2" Time="8" Value="60" /><FloatEvent Id="3" Time="8" Value="120" /></Events></Automation></AutomationEnvelope>`;
  const r = parseAls(set(loc(16, 'Chorus'), env));
  assert.equal(r.markers[0].sec, 12, '8 beats at 60 + 8 beats at 120');
  const ramp = beatToSec([{ beat: 0, bpm: 60 }, { beat: 4, bpm: 120 }]);
  assert.ok(Math.abs(ramp(4) - 4 * 60 * Math.log(2) / 60) < 1e-9);
  assert.throws(() => parseAls(Buffer.from('nu e un set')), /Ableton/);
});
