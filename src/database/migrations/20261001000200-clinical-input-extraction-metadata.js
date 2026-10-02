'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // No reconstruimos metadatos de registros previos ni modificamos su contenido clínico.
      await queryInterface.addColumn('clinical_inputs', 'extraction_metadata', {
        type: Sequelize.JSONB,
        allowNull: true,
      }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('clinical_inputs', 'extraction_metadata', { transaction });
    });
  },
};
