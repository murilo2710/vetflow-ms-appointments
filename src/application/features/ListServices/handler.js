/** Caso de uso: tabela de serviços e preços da clínica (RF06). */
export class ListServicesHandler {
  constructor({ serviceCatalog }) {
    this.serviceCatalog = serviceCatalog;
  }

  async execute() {
    return (await this.serviceCatalog.list()).filter((s) => s.active);
  }
}
