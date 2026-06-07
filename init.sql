create table public.users
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
    deleted_at    timestamp with time zone,
    avatar_hash   text
);

alter table public.users
    owner to resumecraft;

create unique index uq_users_email_lower
    on public.users (lower(email::text));

create table public.resume_versions
(
    id                uuid                     default gen_random_uuid()         not null
        primary key,
    resume_id         uuid                                                       not null,
    user_id           uuid                                                       not null
        constraint fk_resume_versions_user
            references public.users
            on delete cascade,
    content_snapshot  jsonb                                                      not null,
    created_at        timestamp with time zone default now()                     not null,
    snapshot_type     varchar(20)              default 'auto'::character varying not null
        constraint chk_snapshot_type
            check ((snapshot_type)::text = ANY
                   ((ARRAY ['auto'::character varying, 'manual'::character varying, 'default'::character varying])::text[])),
    label             varchar(100)
);

alter table public.resume_versions
    owner to resumecraft;

create table public.resumes
(
    id                      uuid                     default gen_random_uuid()           not null
        primary key,
    user_id                 uuid                                                         not null
        constraint fk_resumes_user
            references public.users
            on delete cascade,
    title                   varchar(120)             default 'resume'::character varying not null,
    content                 jsonb                    default '{}'::jsonb                 not null,
    latest_version_id       uuid
        constraint fk_resumes_latest_version
            references public.resume_versions
            on delete set null,
    created_at              timestamp with time zone default now()                       not null,
    updated_at              timestamp with time zone default now()                       not null,
    deleted_at              timestamp with time zone,
    template                varchar(50)              default 'classic'::character varying,
    locale                  varchar(10)              default 'zh-CN'::character varying,
    based_on_snapshot_id    uuid,
    snapshot_drafts         jsonb                    default '{}'::jsonb                 not null,
    version                 bigint                   default 0                           not null,
    snapshot_drafts_version bigint                   default 0                           not null
);

comment on column public.resumes.based_on_snapshot_id is '当前编辑内容基于的快照ID';

comment on column public.resumes.snapshot_drafts is '快照专属草稿 Map<snapshotId, DraftContent>';

comment on column public.resumes.personal_data is '个人信息（姓名/头像/联系方式），独立存储，多快照共享';

comment on column public.resumes.version is '乐观锁版本号，content 更新时 CAS 比对';

comment on column public.resumes.snapshot_drafts_version is 'snapshot_drafts 独立版本号，避免与 content 共享锁';

alter table public.resumes
    owner to resumecraft;

create index idx_resumes_user_updated_at
    on public.resumes (user_id asc, updated_at desc);

create index idx_resume_versions_user_created_at
    on public.resume_versions (user_id asc, created_at desc);

create index idx_resume_versions_manual
    on public.resume_versions (resume_id asc, snapshot_type asc, created_at desc)
    where ((snapshot_type)::text = 'manual'::text);

create index idx_resume_versions_auto
    on public.resume_versions (resume_id asc, created_at desc)
    where ((snapshot_type)::text = 'auto'::text);

create table public.ai_usage_daily
(
    id                uuid                     default gen_random_uuid() not null
        primary key,
    user_id           uuid                                               not null
        constraint fk_ai_usage_daily_user
            references public.users
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

alter table public.ai_usage_daily
    owner to resumecraft;

create index idx_ai_usage_daily_usage_date
    on public.ai_usage_daily (usage_date desc);

create table public.login_attempt_logs
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

alter table public.login_attempt_logs
    owner to resumecraft;

create index idx_login_attempt_logs_email_created_at
    on public.login_attempt_logs (lower(email::text) asc, created_at desc);

create index idx_login_attempt_logs_created_at
    on public.login_attempt_logs (created_at desc);

create table public.system_logs
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

alter table public.system_logs
    owner to resumecraft;

create index idx_system_logs_level_created_at
    on public.system_logs (level asc, created_at desc);

create index idx_system_logs_source_created_at
    on public.system_logs (source asc, created_at desc);

create table public.ai_configs
(
    id                uuid                     default gen_random_uuid()                not null
        primary key,
    user_id           uuid
        references public.users
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

comment on table public.ai_configs is 'AI 服务配置（API Key 加密存储）';

comment on column public.ai_configs.provider is 'AI 服务商：openai, deepseek, zhipu 等';

comment on column public.ai_configs.api_key_encrypted is 'API Key 使用 AES-256-GCM 加密存储';

comment on column public.ai_configs.is_global is '是否为全局配置（系统级配置）';

alter table public.ai_configs
    owner to resumecraft;

create unique index idx_ai_configs_user_unique
    on public.ai_configs (user_id)
    where (NOT is_global);

create index idx_ai_configs_user_id
    on public.ai_configs (user_id)
    where (user_id IS NOT NULL);

create index idx_ai_configs_is_global
    on public.ai_configs (is_global)
    where (is_global = true);

create table public.ai_conversations
(
    id                  uuid                     default gen_random_uuid() not null
        primary key,
    user_id             uuid                                               not null
        references public.users
            on delete cascade,
    resume_id           uuid
                                                                           references public.resumes
                                                                               on delete set null,
    type                varchar(30)                                        not null,
    title               varchar(200),
    context             jsonb,
    created_at          timestamp with time zone default now()             not null,
    updated_at          timestamp with time zone default now()             not null,
    module_type         varchar(50),
    module_instance_id  varchar(100),
    snapshot_version_id uuid
                                                                           references public.resume_versions
                                                                               on delete set null
);

comment on table public.ai_conversations is 'AI 对话会话（评估/建议等）';

comment on column public.ai_conversations.type is '会话类型：evaluate(简历评估), suggest(内容润色), rewrite(内容改写)';

comment on column public.ai_conversations.context is '会话上下文（简历摘要、模块信息等）';

alter table public.ai_conversations
    owner to resumecraft;

create index idx_ai_conversations_user_id
    on public.ai_conversations (user_id);

create index idx_ai_conversations_resume_id
    on public.ai_conversations (resume_id);

create index idx_ai_conversations_type
    on public.ai_conversations (type);

create index idx_ai_conversations_module
    on public.ai_conversations (user_id, module_type, module_instance_id)
    where (module_type IS NOT NULL);

create index idx_ai_conversations_snapshot_version
    on public.ai_conversations (snapshot_version_id)
    where (snapshot_version_id IS NOT NULL);

create table public.ai_messages
(
    id              uuid                     default gen_random_uuid() not null
        primary key,
    conversation_id uuid                                               not null
        references public.ai_conversations
            on delete cascade,
    role            varchar(20)                                        not null,
    content         text                                               not null,
    model           varchar(100),
    input_tokens    integer,
    output_tokens   integer,
    created_at      timestamp with time zone default now()             not null
);

comment on table public.ai_messages is 'AI 对话消息';

comment on column public.ai_messages.role is '角色：user, assistant, system';

alter table public.ai_messages
    owner to resumecraft;

create index idx_ai_messages_conversation_id
    on public.ai_messages (conversation_id);

create table public.ai_suggest_records
(
    id                 uuid                     default gen_random_uuid()     not null
        primary key,
    user_id            uuid                                                   not null
        references public.users
            on delete cascade,
    resume_id          uuid
                                                                              references public.resumes
                                                                                  on delete set null,
    conversation_id    uuid
                                                                              references public.ai_conversations
                                                                                  on delete set null,
    module_type        varchar(50)                                            not null,
    module_instance_id varchar(100)                                           not null,
    field_key          varchar(100)             default ''::character varying not null,
    original_content   text                                                   not null,
    optimized_content  text,
    created_at         timestamp with time zone default now()                 not null
);

comment on table public.ai_suggest_records is 'AI 润色记录（原文 + 优化结果）';

comment on column public.ai_suggest_records.conversation_id is '关联 ai_conversations 表，用于回溯 AI 建议完整上下文';

comment on column public.ai_suggest_records.module_type is '模块类型：work, education, project, skills, summary, custom';

comment on column public.ai_suggest_records.module_instance_id is '模块实例 UUID（区分同模块的多个条目，如多条工作经历）';

comment on column public.ai_suggest_records.field_key is '字段名：content, description 等';

comment on column public.ai_suggest_records.original_content is '润色前的原文内容';

comment on column public.ai_suggest_records.optimized_content is '润色后的内容（用户未采纳时为空）';

alter table public.ai_suggest_records
    owner to resumecraft;

create index idx_ai_suggest_records_user_id
    on public.ai_suggest_records (user_id);

create index idx_ai_suggest_records_resume_id
    on public.ai_suggest_records (resume_id);

create index idx_ai_suggest_records_module_instance
    on public.ai_suggest_records (user_id, module_type, module_instance_id);

create index idx_ai_suggest_records_created_at
    on public.ai_suggest_records (created_at desc);

create table public.resume_parser_configs
(
    id                uuid                     default gen_random_uuid() not null
        primary key,
    user_id           uuid                                               not null
        constraint uq_resume_parser_configs_user
            unique
        constraint fk_resume_parser_configs_user
            references public.users
            on delete cascade,
    provider          varchar(64)                                        not null,
    api_key_encrypted text                                               not null,
    base_url          text                     default ''::text          not null,
    model             varchar(128)                                       not null,
    enabled           boolean                  default true              not null,
    created_at        timestamp with time zone default now()             not null,
    updated_at        timestamp with time zone default now()             not null
);

alter table public.resume_parser_configs
    owner to resumecraft;

create index idx_resume_parser_configs_user
    on public.resume_parser_configs (user_id);

create table public.jd_parsed_cache
(
    id            uuid                     default gen_random_uuid() not null
        primary key,
    jd_hash       varchar(64)                                        not null
        constraint uq_jd_parsed_cache_hash
            unique,
    jd_text       text                                               not null,
    parsed_result jsonb                                              not null,
    hit_count     integer                  default 1                 not null,
    created_at    timestamp with time zone default now()             not null,
    updated_at    timestamp with time zone default now()             not null
);

alter table public.jd_parsed_cache
    owner to resumecraft;

create index idx_jd_parsed_cache_hash
    on public.jd_parsed_cache (jd_hash);

create table public.resume_scores
(
    id            uuid                     default gen_random_uuid() not null
        primary key,
    user_id       uuid                                               not null
        constraint fk_resume_scores_user
            references public.users
            on delete cascade,
    resume_id     uuid
        constraint fk_resume_scores_resume
            references public.resumes
            on delete set null,
    jd_hash       varchar(64),
    jd_text       text,
    jd_parsed     jsonb                    default '{}'::jsonb       not null,
    ats_score     jsonb                    default '{}'::jsonb       not null,
    keyword_match jsonb                    default '{}'::jsonb       not null,
    seniority_fit jsonb                    default '{}'::jsonb       not null,
    overall_score integer                                            not null,
    level         varchar(10)                                        not null,
    improvements  jsonb                    default '[]'::jsonb       not null,
    model         varchar(128),
    created_at    timestamp with time zone default now()             not null
);

alter table public.resume_scores
    owner to resumecraft;

create index idx_resume_scores_user_created_at
    on public.resume_scores (user_id asc, created_at desc);

create index idx_resume_scores_resume_created_at
    on public.resume_scores (resume_id asc, created_at desc);

create index idx_resume_scores_jd_hash
    on public.resume_scores (jd_hash);

create table public.bullet_rewrites
(
    id                 uuid                     default gen_random_uuid() not null
        primary key,
    user_id            uuid                                               not null
        constraint fk_bullet_rewrites_user
            references public.users
            on delete cascade,
    resume_id          uuid
        constraint fk_bullet_rewrites_resume
            references public.resumes
            on delete set null,
    conversation_id    uuid
        constraint fk_bullet_rewrites_conversation
            references public.ai_conversations
            on delete set null,
    module_type        varchar(50)                                        not null,
    module_instance_id varchar(100),
    field_key          varchar(100)                                       not null,
    original_text      text                                               not null,
    jd_text            text,
    all_versions       jsonb                    default '[]'::jsonb       not null,
    model              varchar(128),
    created_at         timestamp with time zone default now()             not null
);

alter table public.bullet_rewrites
    owner to resumecraft;

create index idx_bullet_rewrites_user_resume_created_at
    on public.bullet_rewrites (user_id asc, resume_id asc, created_at desc);

create index idx_bullet_rewrites_conversation
    on public.bullet_rewrites (conversation_id);

create table public.auth_sessions
(
    id                 uuid                     default gen_random_uuid() not null
        primary key,
    user_id            uuid                                               not null
        constraint fk_auth_sessions_user
            references public.users
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

alter table public.auth_sessions
    owner to resumecraft;

create index idx_auth_sessions_user_expires_at
    on public.auth_sessions (user_id asc, expires_at desc);

create index idx_auth_sessions_active
    on public.auth_sessions (user_id, revoked_at, expires_at);

create table public.ai_generation_records
(
    id                uuid                     default gen_random_uuid()            not null
        primary key,
    user_id           uuid                                                          not null
        constraint fk_ai_generation_records_user
            references public.users
            on delete cascade,
    resume_id         uuid
        constraint fk_ai_generation_records_resume
            references public.resumes
            on delete set null,
    resume_version_id uuid
        constraint fk_ai_generation_records_resume_version
            references public.resume_versions
            on delete set null,
    scenario          varchar(64)                                                   not null,
    module_type       varchar(64),
    provider          varchar(64)                                                   not null,
    model             varchar(128)                                                  not null,
    prompt_text       text                                                          not null,
    response_text     text,
    request_payload   jsonb                    default '{}'::jsonb                  not null,
    response_payload  jsonb                    default '{}'::jsonb                  not null,
    status            varchar(32)              default 'success'::character varying not null,
    error_message     text,
    latency_ms        integer                  default 0                            not null,
    prompt_tokens     integer                  default 0                            not null,
    completion_tokens integer                  default 0                            not null,
    total_tokens      integer                  default 0                            not null,
    created_at        timestamp with time zone default now()                        not null
);

alter table public.ai_generation_records
    owner to resumecraft;

create index idx_ai_generation_records_user_created_at
    on public.ai_generation_records (user_id asc, created_at desc);

create index idx_ai_generation_records_resume_created_at
    on public.ai_generation_records (resume_id asc, created_at desc);

create index idx_ai_generation_records_status_created_at
    on public.ai_generation_records (status asc, created_at desc);

