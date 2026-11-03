const express = require('express');
const app = express();
app.use(express.json());

// Endpoint mock para validar el CUIL contra el Padrón Nacional
app.get('/api/v1/jubilados/:cuil', (req, res) => {
  const { cuil } = req.params;
  // Simulación: responde habilitado para cualquier CUIL que termine en número par
  const esJubilado = parseInt(cuil.slice(-1)) % 2 === 0;

  res.json({
    cuil,
    esJubilado,
    estado: esJubilado ? "ACTIVO" : "NO_REGISTRADO"
  });
});

app.listen(8081, () => {
  console.log('Mock de Padrón Nacional escuchando en puerto 8081');
});