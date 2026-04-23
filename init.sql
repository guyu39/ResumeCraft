create table users
(
    id            uuid                     default gen_random_uuid()     not null
        primary key,
    email         varchar(255)                                           not null,
    password_hash text                                                   not null,
    display_name  varchar(100)             default ''::character varying not null,
    avatar_url    text,
    created_at    timestamp with time zone default now()                 not null,
    updated_at    timestamp with time zone default now()                 not null,
    last_login_at timestamp with time zone,
    deleted_at    timestamp with time zone
);

alter table users
    owner to resumecraft;

create unique index uq_users_email_lower
    on users (lower(email::text));

create trigger trg_users_set_updated_at
    before update
    on users
    for each row
execute procedure set_updated_at();

create table resumes
(
    id                uuid                     default gen_random_uuid()           not null
        primary key,
    user_id           uuid                                                         not null
        constraint fk_resumes_user
            references users
            on delete cascade,
    title             varchar(120)             default 'resume'::character varying not null,
    content           jsonb                    default '{}'::jsonb                 not null,
    latest_version_id uuid,
    created_at        timestamp with time zone default now()                       not null,
    updated_at        timestamp with time zone default now()                       not null,
    deleted_at        timestamp with time zone,
    template          varchar(50)              default 'classic'::character varying,
    theme_color       varchar(20)              default '#1A56DB'::character varying,
    locale            varchar(10)              default 'zh-CN'::character varying
);

alter table resumes
    owner to resumecraft;

create index idx_resumes_user_updated_at
    on resumes (user_id asc, updated_at desc);

create index idx_resumes_user_created_at
    on resumes (user_id asc, created_at desc);

create trigger trg_resumes_set_updated_at
    before update
    on resumes
    for each row
execute procedure set_updated_at();

create table resume_versions
(
    id               uuid                     default gen_random_uuid() not null
        primary key,
    resume_id        uuid                                               not null
        constraint fk_resume_versions_resume
            references resumes
            on delete cascade,
    user_id          uuid                                               not null
        constraint fk_resume_versions_user
            references users
            on delete cascade,
    version_no       integer                                            not null
        constraint resume_versions_version_no_check
            check (version_no > 0),
    content_snapshot jsonb                                              not null,
    created_at       timestamp with time zone default now()             not null,
    created_by       uuid
        constraint fk_resume_versions_created_by
            references users
            on delete set null,
    constraint uq_resume_versions_resume_version
        unique (resume_id, version_no)
);

alter table resume_versions
    owner to resumecraft;

alter table resumes
    add constraint fk_resumes_latest_version
        foreign key (latest_version_id) references resume_versions
            on delete set null;

create index idx_resume_versions_resume_version_desc
    on resume_versions (resume_id asc, version_no desc);

create index idx_resume_versions_user_created_at
    on resume_versions (user_id asc, created_at desc);

create table auth_sessions
(
    id                 uuid                     default gen_random_uuid() not null
        primary key,
    user_id            uuid                                               not null
        constraint fk_auth_sessions_user
            references users
            on delete cascade,
    refresh_token_hash text                                               not null
        constraint uq_auth_sessions_refresh_token_hash
            unique,
    user_agent         text,
    ip_address         inet,
    expires_at         timestamp with time zone                           not null,
    revoked_at         timestamp with time zone,
    created_at         timestamp with time zone default now()             not null,
    updated_at         timestamp with time zone default now()             not null
);

alter table auth_sessions
    owner to resumecraft;

create index idx_auth_sessions_user_expires_at
    on auth_sessions (user_id asc, expires_at desc);

create index idx_auth_sessions_active
    on auth_sessions (user_id, revoked_at, expires_at);

create trigger trg_auth_sessions_set_updated_at
    before update
    on auth_sessions
    for each row
execute procedure set_updated_at();

create table audit_logs
(
    id            uuid                     default gen_random_uuid() not null
        primary key,
    user_id       uuid
        constraint fk_audit_logs_user
            references users
            on delete set null,
    action        varchar(64)                                        not null,
    resource_type varchar(64)                                        not null,
    resource_id   uuid,
    request_id    varchar(64),
    detail        jsonb                    default '{}'::jsonb       not null,
    ip_address    inet,
    user_agent    text,
    created_at    timestamp with time zone default now()             not null
);

alter table audit_logs
    owner to resumecraft;

create index idx_audit_logs_user_created_at
    on audit_logs (user_id asc, created_at desc);

create index idx_audit_logs_action_created_at
    on audit_logs (action asc, created_at desc);

create table ai_usage_daily
(
    id                uuid                     default gen_random_uuid() not null
        primary key,
    user_id           uuid                                               not null
        constraint fk_ai_usage_daily_user
            references users
            on delete cascade,
    usage_date        date                                               not null,
    request_count     integer                  default 0                 not null,
    success_count     integer                  default 0                 not null,
    failure_count     integer                  default 0                 not null,
    prompt_tokens     integer                  default 0                 not null,
    completion_tokens integer                  default 0                 not null,
    total_tokens      integer                  default 0                 not null,
    created_at        timestamp with time zone default now()             not null,
    updated_at        timestamp with time zone default now()             not null,
    constraint uq_ai_usage_daily_user_date
        unique (user_id, usage_date)
);

alter table ai_usage_daily
    owner to resumecraft;

create index idx_ai_usage_daily_usage_date
    on ai_usage_daily (usage_date desc);

create trigger trg_ai_usage_daily_set_updated_at
    before update
    on ai_usage_daily
    for each row
execute procedure set_updated_at();

create table login_attempt_logs
(
    id         uuid                     default gen_random_uuid() not null
        primary key,
    email      varchar(255)                                       not null,
    success    boolean                                            not null,
    reason     varchar(128),
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone default now()             not null
);

alter table login_attempt_logs
    owner to resumecraft;

create index idx_login_attempt_logs_email_created_at
    on login_attempt_logs (lower(email::text) asc, created_at desc);

create index idx_login_attempt_logs_created_at
    on login_attempt_logs (created_at desc);

create table system_logs
(
    id         uuid                     default gen_random_uuid() not null
        primary key,
    level      varchar(16)                                        not null,
    source     varchar(64)                                        not null,
    event      varchar(128)                                       not null,
    detail     jsonb                    default '{}'::jsonb       not null,
    request_id varchar(64),
    created_at timestamp with time zone default now()             not null
);

alter table system_logs
    owner to resumecraft;

create index idx_system_logs_level_created_at
    on system_logs (level asc, created_at desc);

create index idx_system_logs_source_created_at
    on system_logs (source asc, created_at desc);

create table ai_configs
(
    id                uuid                     default gen_random_uuid()                not null
        primary key,
    user_id           uuid
        references users
            on delete cascade,
    provider          varchar(50)              default 'openai'::character varying      not null,
    api_key_encrypted text                                                              not null,
    base_url          varchar(500)                                                      not null,
    default_model     varchar(100)             default 'gpt-4o-mini'::character varying not null,
    evaluate_model    varchar(100),
    timeout_ms        integer                  default 60000                            not null,
    enabled           boolean                  default true                             not null,
    is_global         boolean                  default false                            not null,
    created_at        timestamp with time zone default now()                            not null,
    updated_at        timestamp with time zone default now()                            not null
);

comment on table ai_configs is 'AI 服务配置（API Key 加密存储）';

comment on column ai_configs.provider is 'AI 服务商：openai, deepseek, zhipu 等';

comment on column ai_configs.api_key_encrypted is 'API Key 使用 AES-256-GCM 加密存储';

comment on column ai_configs.is_global is '是否为全局配置（系统级配置）';

alter table ai_configs
    owner to resumecraft;

create unique index idx_ai_configs_user_unique
    on ai_configs (user_id)
    where (NOT is_global);

create index idx_ai_configs_user_id
    on ai_configs (user_id)
    where (user_id IS NOT NULL);

create index idx_ai_configs_is_global
    on ai_configs (is_global)
    where (is_global = true);

create table ai_conversations
(
    id                 uuid                     default gen_random_uuid() not null
        primary key,
    user_id            uuid                                               not null
        references users
            on delete cascade,
    resume_id          uuid
                                                                          references resumes
                                                                              on delete set null,
    type               varchar(30)                                        not null,
    title              varchar(200),
    context            jsonb,
    created_at         timestamp with time zone default now()             not null,
    updated_at         timestamp with time zone default now()             not null,
    module_type        varchar(50),
    module_instance_id varchar(100)
);

comment on table ai_conversations is 'AI 对话会话（评估/建议等）';

comment on column ai_conversations.type is '会话类型：evaluate(简历评估), suggest(内容润色), rewrite(内容改写)';

comment on column ai_conversations.context is '会话上下文（简历摘要、模块信息等）';

alter table ai_conversations
    owner to resumecraft;

create index idx_ai_conversations_user_id
    on ai_conversations (user_id);

create index idx_ai_conversations_resume_id
    on ai_conversations (resume_id);

create index idx_ai_conversations_type
    on ai_conversations (type);

create index idx_ai_conversations_module
    on ai_conversations (user_id, module_type, module_instance_id)
    where (module_type IS NOT NULL);

create table ai_messages
(
    id              uuid                     default gen_random_uuid() not null
        primary key,
    conversation_id uuid                                               not null
        references ai_conversations
            on delete cascade,
    role            varchar(20)                                        not null,
    content         text                                               not null,
    model           varchar(100),
    input_tokens    integer,
    output_tokens   integer,
    created_at      timestamp with time zone default now()             not null
);

comment on table ai_messages is 'AI 对话消息';

comment on column ai_messages.role is '角色：user, assistant, system';

alter table ai_messages
    owner to resumecraft;

create index idx_ai_messages_conversation_id
    on ai_messages (conversation_id);

create table ai_suggest_records
(
    id                 uuid                     default gen_random_uuid()     not null
        primary key,
    user_id            uuid                                                   not null
        references users
            on delete cascade,
    resume_id          uuid
                                                                              references resumes
                                                                                  on delete set null,
    conversation_id    uuid
                                                                              references ai_conversations
                                                                                  on delete set null,
    module_type        varchar(50)                                            not null,
    module_instance_id varchar(100)                                           not null,
    field_key          varchar(100)             default ''::character varying not null,
    original_content   text                                                   not null,
    optimized_content  text,
    created_at         timestamp with time zone default now()                 not null
);

comment on table ai_suggest_records is 'AI 润色记录（原文 + 优化结果）';

comment on column ai_suggest_records.conversation_id is '关联 ai_conversations 表，用于回溯 AI 建议完整上下文';

comment on column ai_suggest_records.module_type is '模块类型：work, education, project, skills, summary, custom';

comment on column ai_suggest_records.module_instance_id is '模块实例 UUID（区分同模块的多个条目，如多条工作经历）';

comment on column ai_suggest_records.field_key is '字段名：content, description 等';

comment on column ai_suggest_records.original_content is '润色前的原文内容';

comment on column ai_suggest_records.optimized_content is '润色后的内容（用户未采纳时为空）';

alter table ai_suggest_records
    owner to resumecraft;

create index idx_ai_suggest_records_user_id
    on ai_suggest_records (user_id);

create index idx_ai_suggest_records_resume_id
    on ai_suggest_records (resume_id);

create index idx_ai_suggest_records_module_instance
    on ai_suggest_records (user_id, module_type, module_instance_id);

create index idx_ai_suggest_records_created_at
    on ai_suggest_records (created_at desc);


