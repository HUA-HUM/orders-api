import { extractMegatoneEnrichment } from './megatoneOrderEnrichment';

describe('extractMegatoneEnrichment', () => {
  it('extracts customer + shipping from the real Cliente shape', () => {
    const enrichment = extractMegatoneEnrichment({
      IdOrden: 6147982,
      Cliente: {
        Nombre: 'ADM ALSK',
        Apellido: 'srl',
        TipoDocumento: 'DNI',
        Documento: 43722979,
        NumeroCuit: '',
        Email: 'admalsk3@gmail.com',
        Telefono: '1138031908',
        Calle: 'avenida paseo colon',
        Numero: '746',
        Piso: '2',
        Localidad: 'Capital Federal',
        Provincia: 'CAPITAL FEDERAL',
        CodigoPostal: 1063,
      },
    });

    expect(enrichment.customer).toEqual({
      document: '43722979',
      phone: '1138031908',
      email: 'admalsk3@gmail.com',
    });
    expect(enrichment.shipping).toEqual({
      address: 'avenida paseo colon 746 2',
      city: 'Capital Federal',
      province: 'CAPITAL FEDERAL',
      zipCode: '1063',
    });
  });

  it('prefers NumeroCuit over Documento when present', () => {
    const enrichment = extractMegatoneEnrichment({
      Cliente: {
        Nombre: 'Ana',
        Apellido: 'Paz',
        Documento: 43722979,
        NumeroCuit: '27437229791',
      },
    });

    expect(enrichment.customer.document).toBe('27437229791');
  });

  it('treats the "00" phone placeholder as null', () => {
    const enrichment = extractMegatoneEnrichment({
      Cliente: { Nombre: 'Ana', Apellido: 'Paz', Telefono: '00' },
    });

    expect(enrichment.customer.phone).toBeNull();
  });

  it('returns nulls when Cliente is absent', () => {
    const enrichment = extractMegatoneEnrichment({ IdOrden: 1 });

    expect(enrichment.customer).toEqual({
      document: null,
      phone: null,
      email: null,
    });
    expect(enrichment.shipping).toEqual({
      address: null,
      city: null,
      province: null,
      zipCode: null,
    });
  });
});
