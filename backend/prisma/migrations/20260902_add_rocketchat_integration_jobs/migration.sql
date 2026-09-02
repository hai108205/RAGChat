-- CreateTable
CREATE TABLE RocketChatIntegrationJob (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    room_id TEXT NOT NULL,
    thread_id TEXT,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,

    CONSTRAINT RocketChatIntegrationJob_pkey PRIMARY KEY (id)
);

-- CreateIndex
CREATE UNIQUE INDEX RocketChatIntegrationJob_id_key ON RocketChatIntegrationJob(id);

-- CreateIndex
CREATE UNIQUE INDEX RocketChatIntegrationJob_workspace_id_request_id_type_key ON RocketChatIntegrationJob(workspace_id, request_id, type);

-- CreateIndex
CREATE INDEX RocketChatIntegrationJob_status_created_at_idx ON RocketChatIntegrationJob(status, created_at);

-- CreateIndex
CREATE INDEX RocketChatIntegrationJob_workspace_id_room_id_created_at_idx ON RocketChatIntegrationJob(workspace_id, room_id, created_at);
