/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No se permiten dependencias circulares entre módulos.',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'routes-no-db-directo',
      severity: 'error',
      comment: 'Las rutas/controladores HTTP no deben acceder directamente a la capa de datos (db.js); deben pasar por servicios.',
      from: {
        path: '(routes|controllers)'
      },
      to: {
        path: 'db\\.js$'
      }
    },
    {
      name: 'db-aislada-de-http',
      severity: 'error',
      comment: 'La capa de persistencia (db.js) no puede depender de rutas, middlewares ni clientes HTTP.',
      from: {
        path: 'db\\.js$'
      },
      to: {
        path: '(routes|controllers|middlewares)'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default']
    }
  }
};
