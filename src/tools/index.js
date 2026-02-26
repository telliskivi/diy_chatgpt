'use strict';

const datetimeTool = require('./datetime');
const searchTool = require('./search');
const fetchTool = require('./fetch');
const { todoList, todoCreate, todoUpdate, todoDelete } = require('./todo');
const { calendarList, calendarCreate, calendarUpdate, calendarDelete } = require('./calendar');

const ALL_TOOLS = {
  get_datetime: datetimeTool,
  web_search: searchTool,
  web_fetch: fetchTool,
  todo_list: todoList,
  todo_create: todoCreate,
  todo_update: todoUpdate,
  todo_delete: todoDelete,
  calendar_list: calendarList,
  calendar_create: calendarCreate,
  calendar_update: calendarUpdate,
  calendar_delete: calendarDelete,
};

/**
 * Returns array of tool definitions for the given list of enabled tool names.
 */
function getToolDefinitions(enabledTools) {
  if (!enabledTools || enabledTools.length === 0) return [];
  return enabledTools
    .filter(name => ALL_TOOLS[name])
    .map(name => ({
      name: ALL_TOOLS[name].name,
      description: ALL_TOOLS[name].description,
      parameters: ALL_TOOLS[name].parameters,
    }));
}

/**
 * Execute a tool by name with given args. Returns result string.
 */
async function executeTool(name, args) {
  const tool = ALL_TOOLS[name];
  if (!tool) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
  try {
    const result = await tool.execute(args || {});
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

module.exports = { ALL_TOOLS, getToolDefinitions, executeTool };
