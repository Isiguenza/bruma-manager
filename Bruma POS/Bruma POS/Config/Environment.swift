import Foundation

enum AppEnvironment {
    case development
    case production

    static var current: AppEnvironment {
        // Cambia manualmente entre .development y .production.
        // .development = api-server/dev-local.sh + print-server/dev-local.sh
        // en la Mac (sale el letrero "LOCAL · PRUEBAS"). Regresar a
        // .production antes de instalar en los iPads del restaurante o archivar.
        return .production
    }

    var baseURL: String {
        switch self {
        case .development:
            return "http://MacBook-Pro-de-Inaki.local:4000" // Mac local (Bonjour: sirve en simulador y en iPad de la misma red)
        case .production:
            return "https://api.cocinabruma.com.mx" // Nuevo backend Express
        }
    }

    var printServerURL: String {
        switch self {
        case .development:
            return "http://MacBook-Pro-de-Inaki.local:3003" // print-server/dev-local.sh (impresoras reales)
        case .production:
            return "http://192.168.0.152:3001"
        }
    }
}
