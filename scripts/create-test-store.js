// Script para crear tienda de prueba en Uber Eats Sandbox
require('dotenv').config();

const UBER_ACCESS_TOKEN = process.env.UBER_ACCESS_TOKEN;
const SANDBOX_API = 'https://api.uber.com';

async function createTestStore() {
  try {
    console.log('🏪 Creando tienda de prueba en Uber Eats...\n');

    const storeData = {
      name: 'El Espantapájaros - Test',
      location: {
        address: {
          street_address: ['Av. Reforma 123'],
          city: 'Ciudad de México',
          state: 'CDMX',
          zip_code: '06600',
          country: 'MX',
        },
        latitude: 19.4326,
        longitude: -99.1332,
      },
      contact: {
        phone: '+525551234567',
        email: 'test@espantapajaros.com',
      },
      hours: {
        monday: [{ start: '09:00', end: '22:00' }],
        tuesday: [{ start: '09:00', end: '22:00' }],
        wednesday: [{ start: '09:00', end: '22:00' }],
        thursday: [{ start: '09:00', end: '22:00' }],
        friday: [{ start: '09:00', end: '23:00' }],
        saturday: [{ start: '09:00', end: '23:00' }],
        sunday: [{ start: '10:00', end: '21:00' }],
      },
    };

    const response = await fetch(`${SANDBOX_API}/v1/eats/stores`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UBER_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(storeData),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      return;
    }

    const store = await response.json();
    console.log('✅ Tienda creada exitosamente!\n');
    console.log('📋 Detalles:');
    console.log(JSON.stringify(store, null, 2));
    console.log('\n💾 Guarda este Store ID:', store.id);
    console.log('\n📝 Agrégalo a tu .env como:');
    console.log(`UBER_STORE_ID=${store.id}`);
  } catch (error) {
    console.error('❌ Error creando tienda:', error.message);
  }
}

createTestStore();
