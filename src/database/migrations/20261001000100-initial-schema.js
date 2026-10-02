'use strict';

// Esta migración conserva el esquema inicial; no importa los modelos que evolucionarán.
module.exports = {
  async up(queryInterface, S) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      const required = (type) => ({ type, allowNull: false });
      const ref = (table, nullable = false) => ({
        type: S.UUID, allowNull: nullable, references: { model: table, key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      });
      const table = async (name, columns) => queryInterface.createTable(name, {
        id: { type: S.UUID, allowNull: false, primaryKey: true },
        ...columns,
        created_at: required(S.DATE), updated_at: required(S.DATE),
      }, options);
      const index = (name, fields, unique = false) => queryInterface.addIndex(name, fields, { ...options, unique });
      const check = (name, expression, constraint) => queryInterface.sequelize.query(
        `ALTER TABLE "${name}" ADD CONSTRAINT "${constraint}" CHECK (${expression})`, options,
      );

      await table('users', {
        full_name: required(S.STRING), email: { ...required(S.STRING), unique: true },
        password_hash: required(S.TEXT), role: required(S.STRING(20)),
        active: { ...required(S.BOOLEAN), defaultValue: true },
      });
      await check('users', "role IN ('assistant', 'physician')", 'users_role_check');

      await table('patients', {
        source_system: { ...required(S.STRING), defaultValue: 'external_portal' },
        external_patient_id: required(S.STRING), full_name: required(S.TEXT), birth_date: S.DATEONLY,
      });
      await index('patients', ['source_system', 'external_patient_id'], true);

      await table('attentions', {
        patient_id: ref('patients'), source_system: { ...required(S.STRING), defaultValue: 'external_portal' },
        external_attention_id: S.STRING, study_date: required(S.DATEONLY),
        age_at_study: S.STRING, age_years: S.INTEGER, age_months: S.INTEGER,
        center_name: S.STRING, priority: S.STRING, source_metadata: S.JSONB,
      });
      await index('attentions', ['patient_id', 'study_date']);
      await index('attentions', ['source_system', 'external_attention_id'], true);
      await check('attentions', 'age_years >= 0 AND age_months BETWEEN 0 AND 11', 'attentions_age_check');

      await table('procedures', {
        attention_id: ref('attentions'), external_procedure_id: S.STRING,
        name: required(S.TEXT), anatomical_region: S.STRING, laterality: S.STRING(30), modality: S.STRING(30),
      });
      await index('procedures', ['attention_id']);
      await index('procedures', ['id', 'attention_id'], true);

      await table('clinical_inputs', {
        attention_id: { ...ref('attentions'), unique: true },
        diagnosis: S.TEXT, symptoms: S.TEXT, medical_history: S.TEXT, regular_medications: S.TEXT,
        previous_surgeries: S.TEXT, previous_exams: S.TEXT, other: S.TEXT, findings: S.TEXT,
        raw_text: required(S.TEXT), additional_fields: S.JSONB, source_url: S.TEXT, extracted_at: S.DATE,
      });

      await table('templates', {
        name: required(S.STRING), procedure_name: S.STRING, anatomical_region: S.STRING,
        laterality: S.STRING(30), active: { ...required(S.BOOLEAN), defaultValue: true },
      });
      await table('template_versions', {
        template_id: ref('templates'), version: required(S.INTEGER),
        instructions: required(S.TEXT), output_structure: required(S.JSONB),
        input_variables: { ...required(S.JSONB), defaultValue: [] },
      });
      await index('template_versions', ['template_id', 'version'], true);
      await check('template_versions', 'version > 0', 'template_versions_number_check');

      await table('generations', {
        attention_id: ref('attentions'), template_version_id: ref('template_versions'), requested_by_id: ref('users', true),
        provider: required(S.STRING), model: required(S.STRING), input_snapshot: required(S.JSONB),
        final_prompt: required(S.TEXT), response_text: S.TEXT,
        status: { ...required(S.STRING(20)), defaultValue: 'pending' },
        error_code: S.STRING, provider_request_id: S.STRING, completed_at: S.DATE,
      });
      await index('generations', ['attention_id']);
      await index('generations', ['id', 'attention_id'], true);
      await check('generations', "status IN ('pending', 'running', 'completed', 'failed')", 'generations_status_check');

      await table('reports', {
        attention_id: ref('attentions'), external_report_id: S.STRING,
        status: { ...required(S.STRING(30)), defaultValue: 'draft' }, report_date: S.DATEONLY, sent_at: S.DATE,
      });
      await index('reports', ['attention_id']);
      await index('reports', ['id', 'attention_id'], true);
      await check('reports', "status IN ('draft', 'in_review', 'approved', 'send_pending', 'sent', 'rejected')", 'reports_status_check');

      await table('report_versions', {
        attention_id: ref('attentions'), report_id: ref('reports'), generation_id: ref('generations', true),
        version: required(S.INTEGER), content: required(S.TEXT),
        created_by_id: ref('users', true), approved_by_id: ref('users', true), approved_at: S.DATE, review_notes: S.TEXT,
      });
      await index('report_versions', ['report_id', 'version'], true);
      await check('report_versions', 'version > 0', 'report_versions_number_check');
      await check('report_versions', '(approved_by_id IS NULL) = (approved_at IS NULL)', 'report_versions_approval_check');
      await queryInterface.sequelize.query(`
        ALTER TABLE report_versions ADD CONSTRAINT report_versions_report_attention_fk
          FOREIGN KEY (report_id, attention_id) REFERENCES reports (id, attention_id) ON DELETE RESTRICT;
        ALTER TABLE report_versions ADD CONSTRAINT report_versions_generation_attention_fk
          FOREIGN KEY (generation_id, attention_id) REFERENCES generations (id, attention_id) ON DELETE RESTRICT;
      `, options);

      await table('report_procedures', {
        attention_id: ref('attentions'), report_id: ref('reports'), procedure_id: ref('procedures'),
      });
      await index('report_procedures', ['report_id', 'procedure_id'], true);

      await table('study_files', {
        attention_id: ref('attentions'), procedure_id: ref('procedures', true), kind: required(S.STRING(30)),
        storage_key: required(S.TEXT), original_name: S.TEXT, mime_type: S.STRING,
        byte_size: S.BIGINT, sha256: S.STRING(64), external_file_id: S.STRING, source_metadata: S.JSONB,
      });
      await index('study_files', ['attention_id']);
      await check('study_files', "kind IN ('image', 'video', 'medical_order', 'questionnaire', 'other')", 'study_files_kind_check');
      await check('study_files', 'byte_size >= 0', 'study_files_size_check');
      await queryInterface.sequelize.query(`ALTER TABLE study_files ADD CONSTRAINT study_files_procedure_attention_fk
        FOREIGN KEY (procedure_id, attention_id) REFERENCES procedures (id, attention_id) ON DELETE RESTRICT`, options);

      // Las claves compuestas impiden mezclar atenciones incluso al actualizar los padres.
      await queryInterface.sequelize.query(`
        ALTER TABLE report_procedures ADD CONSTRAINT report_procedures_report_attention_fk
          FOREIGN KEY (report_id, attention_id) REFERENCES reports (id, attention_id) ON DELETE RESTRICT;
        ALTER TABLE report_procedures ADD CONSTRAINT report_procedures_procedure_attention_fk
          FOREIGN KEY (procedure_id, attention_id) REFERENCES procedures (id, attention_id) ON DELETE RESTRICT;
      `, options);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const options = { transaction };
      for (const name of [
        'study_files', 'report_procedures', 'report_versions', 'reports', 'generations',
        'template_versions', 'templates', 'clinical_inputs', 'procedures', 'attentions', 'patients', 'users',
      ]) await queryInterface.dropTable(name, options);
    });
  },
};
