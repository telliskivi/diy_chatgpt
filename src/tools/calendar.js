'use strict';

const db = require('../db');

const calendarList = {
  name: 'calendar_list',
  description: 'List calendar events, optionally filtered by date range',
  parameters: {
    type: 'object',
    properties: {
      start: { type: 'string', description: 'Start date/time filter (ISO 8601)' },
      end: { type: 'string', description: 'End date/time filter (ISO 8601)' },
    },
  },
  execute({ start, end } = {}) {
    const events = db.listCalendarEvents('default', start, end);
    return JSON.stringify(events);
  },
};

const calendarCreate = {
  name: 'calendar_create',
  description: 'Create a new calendar event',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      description: { type: 'string', description: 'Event description' },
      start_time: { type: 'string', description: 'Start time in ISO 8601 format' },
      end_time: { type: 'string', description: 'End time in ISO 8601 format' },
    },
    required: ['title', 'start_time'],
  },
  execute({ title, description, start_time, end_time }) {
    const event = db.createCalendarEvent({ title, description, start_time, end_time }, 'default');
    return JSON.stringify(event);
  },
};

const calendarUpdate = {
  name: 'calendar_update',
  description: 'Update an existing calendar event',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the event to update' },
      title: { type: 'string' },
      description: { type: 'string' },
      start_time: { type: 'string' },
      end_time: { type: 'string' },
    },
    required: ['id'],
  },
  execute({ id, title, description, start_time, end_time }) {
    const event = db.updateCalendarEvent(id, { title, description, start_time, end_time }, 'default');
    return JSON.stringify(event);
  },
};

const calendarDelete = {
  name: 'calendar_delete',
  description: 'Delete a calendar event',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the event to delete' },
    },
    required: ['id'],
  },
  execute({ id }) {
    db.deleteCalendarEvent(id, 'default');
    return JSON.stringify({ success: true, id });
  },
};

module.exports = { calendarList, calendarCreate, calendarUpdate, calendarDelete };
