PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_templates (
    template_name TEXT PRIMARY KEY,
    package_name TEXT NOT NULL,
    package_version TEXT NOT NULL,
    locale TEXT NOT NULL,
    purpose TEXT NOT NULL,
    input_schema_json TEXT NOT NULL,
    output_schema_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_template_instructions (
    template_name TEXT NOT NULL,
    instruction_order INTEGER NOT NULL,
    instruction TEXT NOT NULL,
    PRIMARY KEY (template_name, instruction_order),
    FOREIGN KEY (template_name) REFERENCES ai_templates(template_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_entities (
    entity_name TEXT PRIMARY KEY,
    schema_name TEXT NOT NULL,
    schema_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_entity_required_fields (
    entity_name TEXT NOT NULL,
    field_order INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    PRIMARY KEY (entity_name, field_order),
    FOREIGN KEY (entity_name) REFERENCES domain_entities(entity_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_entity_fields (
    entity_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_type_json TEXT NOT NULL,
    PRIMARY KEY (entity_name, field_name),
    FOREIGN KEY (entity_name) REFERENCES domain_entities(entity_name) ON DELETE CASCADE
);
