import {RequestBodyObject, SchemaObject} from '@loopback/rest';

export const json = (schema: SchemaObject): Partial<RequestBodyObject> => ({
  required: true,
  content: {'application/json': {schema}},
});

const uuid: SchemaObject = {type: 'string', format: 'uuid'};
const nullableUuid: SchemaObject = {type: 'string', format: 'uuid', nullable: true};
const timestamp: SchemaObject = {type: 'string', format: 'date-time'};
const nullableTimestamp: SchemaObject = {type: 'string', format: 'date-time', nullable: true};
const nullableNumber: SchemaObject = {type: 'number', nullable: true};

export const deviceSchema: SchemaObject = {
  type: 'object',
  required: ['id'],
  properties: {
    id: uuid,
    flavor: {type: 'string', maxLength: 32},
    model: {type: 'string', maxLength: 128},
    osVersion: {type: 'string', maxLength: 64},
    appVersion: {type: 'string', maxLength: 64},
  },
};

export const syncBatchSchema: SchemaObject = {
  type: 'object',
  required: ['device'],
  properties: {
    device: deviceSchema,
    clientSentAt: timestamp,
    sessions: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        required: ['id', 'status', 'startedAt'],
        properties: {
          id: uuid,
          status: {type: 'string', enum: ['active', 'paused', 'stopped']},
          startedAt: timestamp,
          endedAt: nullableTimestamp,
          name: {type: 'string', maxLength: 120, nullable: true},
          clientDistanceM: nullableNumber,
          clientMovingTimeS: {type: 'integer', nullable: true},
        },
      },
    },
    segments: {
      type: 'array',
      maxItems: 2000,
      items: {
        type: 'object',
        required: ['id', 'sessionId', 'seq', 'startedAt'],
        properties: {
          id: uuid,
          sessionId: uuid,
          seq: {type: 'integer', minimum: 0},
          startedAt: timestamp,
          endedAt: nullableTimestamp,
        },
      },
    },
    points: {
      type: 'array',
      maxItems: 5000,
      items: {
        type: 'object',
        required: ['id', 'sessionId', 'recordedAt', 'lat', 'lon'],
        properties: {
          id: uuid,
          sessionId: uuid,
          segmentId: nullableUuid,
          recordedAt: timestamp,
          lat: {type: 'number', minimum: -90, maximum: 90},
          lon: {type: 'number', minimum: -180, maximum: 180},
          alt: nullableNumber,
          accuracyM: nullableNumber,
          speedMps: nullableNumber,
          bearingDeg: nullableNumber,
          provider: {type: 'string', maxLength: 32, nullable: true},
          isMock: {type: 'boolean'},
          batteryPct: {type: 'integer', minimum: 0, maximum: 100, nullable: true},
        },
      },
    },
    events: {
      type: 'array',
      maxItems: 2000,
      items: {
        type: 'object',
        required: ['id', 'type', 'occurredAt'],
        properties: {
          id: uuid,
          type: {type: 'string', maxLength: 64},
          occurredAt: timestamp,
          sessionId: nullableUuid,
          payload: {type: 'object', nullable: true},
        },
      },
    },
  },
};
