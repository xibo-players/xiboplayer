/**
 * XMDS Client Tests
 *
 * Tests for XMDS campaign parsing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { XmdsClient } from '../../xmds/src/xmds.js';

describe('XmdsClient - Schedule Parsing', () => {
  let client;

  beforeEach(() => {
    client = new XmdsClient({
      cmsAddress: 'http://test',
      cmsKey: 'key',
      hardwareKey: 'hw'
    });
  });

  describe('Campaign Parsing', () => {
    it('should parse schedule with campaigns', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <campaign id="5" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="15">
            <layout file="100"/>
            <layout file="101"/>
            <layout file="102"/>
          </campaign>
          <layout file="200" priority="5" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="20"/>
          <campaign id="6" priority="8" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="25">
            <layout file="300"/>
            <layout file="301"/>
          </campaign>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      // Check default
      expect(schedule.default).toBe('0');

      // Check campaigns
      expect(schedule.campaigns).toHaveLength(2);

      const campaign1 = schedule.campaigns[0];
      expect(campaign1.id).toBe('5');
      expect(campaign1.priority).toBe(10);
      expect(campaign1.layouts).toHaveLength(3);
      expect(campaign1.layouts[0].file).toBe('100');
      expect(campaign1.layouts[1].file).toBe('101');
      expect(campaign1.layouts[2].file).toBe('102');
      expect(campaign1.layouts[0].priority).toBe(10);
      expect(campaign1.layouts[0].campaignId).toBe('5');

      const campaign2 = schedule.campaigns[1];
      expect(campaign2.id).toBe('6');
      expect(campaign2.priority).toBe(8);
      expect(campaign2.layouts).toHaveLength(2);

      // Check standalone layouts
      expect(schedule.layouts).toHaveLength(1);
      expect(schedule.layouts[0].file).toBe('200');
      expect(schedule.layouts[0].priority).toBe(5);
      expect(schedule.layouts[0].campaignId).toBeNull();
    });

    it('should parse schedule with only standalone layouts (backward compatible)', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <layout file="100" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="10"/>
          <layout file="101" priority="5" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="11"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.default).toBe('0');
      expect(schedule.campaigns).toHaveLength(0);
      expect(schedule.layouts).toHaveLength(2);
      expect(schedule.layouts[0].file).toBe('100');
      expect(schedule.layouts[0].priority).toBe(10);
      expect(schedule.layouts[1].file).toBe('101');
      expect(schedule.layouts[1].priority).toBe(5);
    });

    it('should parse empty schedule', () => {
      const xml = `
        <schedule>
          <default file="999"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.default).toBe('999');
      expect(schedule.campaigns).toHaveLength(0);
      expect(schedule.layouts).toHaveLength(0);
    });
  });

  describe('Campaign Layout Timing Inheritance', () => {
    it('should allow layouts to inherit timing from campaign', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <campaign id="1" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="5">
            <layout file="100"/>
            <layout file="101" fromdt="2026-01-30 12:00:00" todt="2026-01-30 18:00:00"/>
          </campaign>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      const campaign = schedule.campaigns[0];

      // First layout inherits campaign timing
      expect(campaign.layouts[0].fromdt).toBe('2026-01-30 00:00:00');
      expect(campaign.layouts[0].todt).toBe('2026-01-31 23:59:59');

      // Second layout has its own timing
      expect(campaign.layouts[1].fromdt).toBe('2026-01-30 12:00:00');
      expect(campaign.layouts[1].todt).toBe('2026-01-30 18:00:00');
    });

    it('should allow layouts to inherit priority from campaign', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <campaign id="1" priority="15" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59">
            <layout file="100"/>
            <layout file="101"/>
          </campaign>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      const campaign = schedule.campaigns[0];

      expect(campaign.layouts[0].priority).toBe(15);
      expect(campaign.layouts[1].priority).toBe(15);
    });

    it('should associate layouts with their campaign ID', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <campaign id="42" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59">
            <layout file="100"/>
            <layout file="101"/>
          </campaign>
          <layout file="200" priority="5" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      // Campaign layouts should have campaignId
      expect(schedule.campaigns[0].layouts[0].campaignId).toBe('42');
      expect(schedule.campaigns[0].layouts[1].campaignId).toBe('42');

      // Standalone layout should not have campaignId
      expect(schedule.layouts[0].campaignId).toBeNull();
    });
  });

  describe('Schedule ID Parsing', () => {
    it('should parse scheduleid attribute', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <layout file="100" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="123"/>
          <campaign id="1" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="456">
            <layout file="200"/>
          </campaign>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.layouts[0].scheduleid).toBe('123');
      expect(schedule.campaigns[0].scheduleid).toBe('456');
    });
  });

  describe('Action Parsing', () => {
    it('should parse action elements from schedule', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <actions>
            <action actionType="navLayout" triggerCode="tc1" layoutCode="42" fromdt="2026-01-01 00:00:00" todt="2030-12-31 23:59:59" priority="5" scheduleid="10"/>
          </actions>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.actions).toHaveLength(1);
      expect(schedule.actions[0].actionType).toBe('navLayout');
      expect(schedule.actions[0].triggerCode).toBe('tc1');
      expect(schedule.actions[0].layoutCode).toBe('42');
      expect(schedule.actions[0].fromDt).toBe('2026-01-01 00:00:00');
      expect(schedule.actions[0].toDt).toBe('2030-12-31 23:59:59');
      expect(schedule.actions[0].priority).toBe(5);
      expect(schedule.actions[0].scheduleId).toBe('10');
    });

    it('should parse multiple actions', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <actions>
            <action actionType="navLayout" triggerCode="tc1" layoutCode="42" fromdt="2026-01-01 00:00:00" todt="2030-12-31 23:59:59" priority="1" scheduleid="1"/>
            <action actionType="command" triggerCode="tc2" commandCode="restart" fromdt="2026-02-01 00:00:00" todt="2026-12-31 23:59:59" priority="10" scheduleid="2"/>
            <action actionType="navigateToWidget" triggerCode="tc3" layoutCode="99" fromdt="2026-01-01 00:00:00" todt="2027-01-01 00:00:00" priority="3" scheduleid="3"/>
          </actions>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.actions).toHaveLength(3);
      expect(schedule.actions[0].triggerCode).toBe('tc1');
      expect(schedule.actions[1].triggerCode).toBe('tc2');
      expect(schedule.actions[1].commandCode).toBe('restart');
      expect(schedule.actions[2].triggerCode).toBe('tc3');
    });

    it('should parse action with geoLocation attributes', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <actions>
            <action actionType="navLayout" triggerCode="geo1" layoutCode="50" fromdt="2026-01-01 00:00:00" todt="2030-12-31 23:59:59" isGeoAware="1" geoLocation="41.3851,2.1734" scheduleid="5"/>
          </actions>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.actions[0].isGeoAware).toBe(true);
      expect(schedule.actions[0].geoLocation).toBe('41.3851,2.1734');
    });

    it('should initialize actions array as empty when no actions element', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <layout file="100" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="1"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.actions).toEqual([]);
    });
  });

  describe('Command Parsing', () => {
    it('should parse command elements from schedule', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <command command="collectNow" date="2026-01-01"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.commands).toHaveLength(1);
      expect(schedule.commands[0].code).toBe('collectNow');
      expect(schedule.commands[0].date).toBe('2026-01-01');
    });

    it('should parse multiple commands', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <command command="collectNow" date="2026-02-11"/>
          <command command="reboot" date="2026-02-12"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.commands).toHaveLength(2);
      expect(schedule.commands[0].code).toBe('collectNow');
      expect(schedule.commands[0].date).toBe('2026-02-11');
      expect(schedule.commands[1].code).toBe('reboot');
      expect(schedule.commands[1].date).toBe('2026-02-12');
    });

    it('should initialize commands array as empty when no command elements', () => {
      const xml = `
        <schedule>
          <default file="0"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.commands).toEqual([]);
    });
  });

  describe('Actions and Commands Together', () => {
    it('should parse both actions and commands in same schedule', () => {
      const xml = `
        <schedule>
          <default file="0"/>
          <layout file="100" priority="5" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="1"/>
          <campaign id="1" priority="10" fromdt="2026-01-30 00:00:00" todt="2026-01-31 23:59:59" scheduleid="2">
            <layout file="200"/>
          </campaign>
          <actions>
            <action actionType="navLayout" triggerCode="tc1" layoutCode="42" fromdt="2026-01-01 00:00:00" todt="2030-12-31 23:59:59" priority="1" scheduleid="10"/>
          </actions>
          <command command="collectNow" date="2026-02-11"/>
        </schedule>
      `;

      const schedule = client.parseScheduleResponse(xml);

      expect(schedule.default).toBe('0');
      expect(schedule.layouts).toHaveLength(1);
      expect(schedule.campaigns).toHaveLength(1);
      expect(schedule.actions).toHaveLength(1);
      expect(schedule.actions[0].triggerCode).toBe('tc1');
      expect(schedule.commands).toHaveLength(1);
      expect(schedule.commands[0].code).toBe('collectNow');
    });
  });
});
