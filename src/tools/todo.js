'use strict';

const db = require('../db');

const todoList = {
  name: 'todo_list',
  description: 'List all todo items',
  parameters: { type: 'object', properties: {} },
  execute(_args) {
    const todos = db.listTodos('default');
    return JSON.stringify(todos);
  },
};

const todoCreate = {
  name: 'todo_create',
  description: 'Create a new todo item',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the todo' },
      description: { type: 'string', description: 'Optional description' },
    },
    required: ['title'],
  },
  execute({ title, description }) {
    const todo = db.createTodo({ title, description }, 'default');
    return JSON.stringify(todo);
  },
};

const todoUpdate = {
  name: 'todo_update',
  description: 'Update an existing todo item',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the todo to update' },
      title: { type: 'string', description: 'New title' },
      description: { type: 'string', description: 'New description' },
      done: { type: 'boolean', description: 'Mark as done or not done' },
    },
    required: ['id'],
  },
  execute({ id, title, description, done }) {
    const todo = db.updateTodo(id, { title, description, done }, 'default');
    return JSON.stringify(todo);
  },
};

const todoDelete = {
  name: 'todo_delete',
  description: 'Delete a todo item',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID of the todo to delete' },
    },
    required: ['id'],
  },
  execute({ id }) {
    db.deleteTodo(id, 'default');
    return JSON.stringify({ success: true, id });
  },
};

module.exports = { todoList, todoCreate, todoUpdate, todoDelete };
