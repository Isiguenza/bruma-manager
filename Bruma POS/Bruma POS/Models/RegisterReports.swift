import Foundation

/// Desgloses de la caja actual para la pantalla de Reportes:
/// ventas por empleado, por producto y por hora. Viene de
/// `GET /api/cash-register/:id/report` (campo `reports`).
struct RegisterReports: Decodable {
    struct EmployeeStat: Decodable, Identifiable {
        let employeeId: String?
        let employeeName: String
        let orders: Int
        let total: Double
        var id: String { employeeId ?? employeeName }
    }
    struct ProductStat: Decodable, Identifiable {
        let productName: String
        let qty: Int
        let total: Double
        var id: String { productName }
    }
    struct HourStat: Decodable, Identifiable {
        let hour: Int
        let orders: Int
        let total: Double
        var id: Int { hour }
    }

    let byEmployee: [EmployeeStat]
    let byProduct: [ProductStat]
    let byHour: [HourStat]
}

/// Envoltura para decodificar solo el bloque `reports` del endpoint /report.
struct RegisterReportEnvelope: Decodable {
    let reports: RegisterReports
}
