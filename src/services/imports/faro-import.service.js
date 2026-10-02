'use strict';

const { sequelize, Patient, Attention, Procedure, ClinicalInput } = require('../../models');

async function importFaroAttention(extraction, options = {}) {
  const { patient, attention, procedures, clinicalInput } = extraction.normalized;
  const metadata = clinicalInput.extractionMetadata;
  if (patient.sourceSystem !== 'faro_gestion' || attention.sourceSystem !== 'faro_gestion'
    || !patient.externalPatientId?.trim() || !patient.fullName?.trim()
    || !attention.externalAttentionId?.trim() || !attention.studyDate
    || !clinicalInput.rawText?.trim() || procedures.length !== 1 || !procedures[0].name?.trim()
    || metadata?.verification?.identicalReads !== true || metadata.verification.rowMatchesHeader !== true
    || extraction.raw.worklistRow?.externalAttentionId !== attention.externalAttentionId) {
    throw new Error('La extracción no reúne los datos y comprobaciones necesarios para importar una atención.');
  }
  return sequelize.transaction(options.transaction ? { transaction: options.transaction } : {}, async (transaction) => {
    const dbOptions = { transaction };
    const savedPatient = await Patient.findOne({
      where: { sourceSystem: patient.sourceSystem, externalPatientId: patient.externalPatientId },
      ...dbOptions, lock: transaction.LOCK.UPDATE,
    }) || await Patient.create(patient, dbOptions);
    const savedAttention = await Attention.findOne({
      where: { sourceSystem: attention.sourceSystem, externalAttentionId: attention.externalAttentionId },
      ...dbOptions, lock: transaction.LOCK.UPDATE,
    }) || await Attention.create({ ...attention, patientId: savedPatient.id }, dbOptions);
    // Serializamos las reimportaciones de una misma atención antes de tocar sus hijos.
    await savedAttention.reload({ ...dbOptions, lock: transaction.LOCK.UPDATE });
    if (savedAttention.patientId !== savedPatient.id) {
      throw new Error('La atención ya existe vinculada a otro paciente. Se revierte la importación.');
    }
    await savedPatient.update({ fullName: patient.fullName }, dbOptions);
    await savedAttention.update(attention, dbOptions);
    const existingProcedures = await Procedure.findAll({ where: { attentionId: savedAttention.id }, ...dbOptions });
    if (existingProcedures.length > 1
      || (existingProcedures.length === 1 && existingProcedures[0].name !== procedures[0].name)) {
      throw new Error('Los procedimientos existentes requieren revisión. Se revierte la importación.');
    }
    const procedure = existingProcedures[0] || await Procedure.create({
      ...procedures[0], attentionId: savedAttention.id,
    }, dbOptions);
    const input = await ClinicalInput.findOne({ where: { attentionId: savedAttention.id }, ...dbOptions })
      || await ClinicalInput.create({ ...clinicalInput, attentionId: savedAttention.id }, dbOptions);
    // Una lectura sin cambios es un reintento. Si cambió el texto, conservamos el
    // respaldo anterior hasta incorporar historial de entradas clínicas.
    if (input.rawText !== clinicalInput.rawText) {
      throw new Error('Cambió el contenido clínico respaldado. Se requiere revisión antes de reemplazarlo.');
    }
    await input.update(clinicalInput, dbOptions);
    return { patientId: savedPatient.id, attentionId: savedAttention.id, procedureId: procedure.id, clinicalInputId: input.id };
  });
}

// Consulta local: no expone datos mediante una ruta HTTP sin autenticación.
async function getFaroAttention(externalAttentionId, options = {}) {
  const attention = await Attention.findOne({
    where: { sourceSystem: 'faro_gestion', externalAttentionId },
    include: ['patient', 'procedures', 'clinicalInput'], transaction: options.transaction,
  });
  if (!attention) throw new Error('No se encontró la atención importada.');
  const plain = attention.get({ plain: true });
  const { patient, procedures, clinicalInput, ...attentionData } = plain;
  return { patient, attention: attentionData, procedures, clinicalInput };
}

module.exports = { importFaroAttention, getFaroAttention };
