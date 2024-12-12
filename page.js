const sql = require('mssql');
const { AzureFunction, Context, HttpRequest } = require('@azure/functions');

const config = {
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // Use encryption for Azure SQL Database.
        enableArithAbort: true
    }
};

const httpTrigger = async function (context, req) {
    try {
        const method = req.method.toUpperCase();
        await sql.connect(config);

        if (method === "GET") {
            const alertId = req.query.id;
            const query = alertId
                ? `SELECT * FROM Alerts WHERE id = @id`
                : `SELECT * FROM Alerts ORDER BY priority DESC`;

            const request = new sql.Request();
            if (alertId) {
                request.input('id', sql.Int, alertId);
            }

            const result = await request.query(query);

            if (alertId && result.recordset.length === 0) {
                context.res = {
                    status: 404,
                    body: { error: "Alert not found" }
                };
            } else {
                context.res = {
                    status: 200,
                    body: alertId ? result.recordset[0] : result.recordset
                };
            }
        } else if (method === "POST") {
            const { message, latitude, longitude, priority } = req.body;

            if (!message || latitude === undefined || longitude === undefined || priority === undefined) {
                context.res = {
                    status: 400,
                    body: { error: "Missing required fields" }
                };
                return;
            }

            const request = new sql.Request();
            request.input('message', sql.VarChar, message);
            request.input('latitude', sql.Float, latitude);
            request.input('longitude', sql.Float, longitude);
            request.input('priority', sql.Int, priority);

            const result = await request.query(
                `INSERT INTO Alerts (message, latitude, longitude, priority) OUTPUT INSERTED.id VALUES (@message, @latitude, @longitude, @priority)`
            );

            const insertedId = result.recordset[0].id;
            context.res = {
                status: 201,
                body: { status: `Successfully inserted alert with id=${insertedId}` }
            };
        } else if (method === "DELETE") {
            const alertId = req.query.id;

            if (alertId) {
                const request = new sql.Request();
                request.input('id', sql.Int, alertId);
                await request.query(`DELETE FROM Alerts WHERE id = @id`);

                context.res = {
                    status: 200,
                    body: { status: `Successfully deleted alert with id=${alertId}` }
                };
            } else {
                await new sql.Request().query(`DELETE FROM Alerts`);
                context.res = {
                    status: 200,
                    body: { status: "Successfully deleted all alerts" }
                };
            }
        } else {
            context.res = {
                status: 405,
                body: { error: "Method not allowed" }
            };
        }
    } catch (err) {
        context.log.error(err);
        context.res = {
            status: 500,
            body: { error: "Internal server error" }
        };
    } finally {
        sql.close();
    }
};

module.exports = httpTrigger;
