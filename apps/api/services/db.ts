import {
  Alert,
  AlertBase,
  AlertType,
  Command,
  CommandBase,
  DateFilter,
  Gateway,
  GatewayBase,
  GatewayUpdate,
  Lamp,
  LampBase,
  LampBox,
  LampBoxBase,
  LampBoxUpdate,
  LampProfile,
  LampProfileBase,
  LampProfileUpdate,
  LampUpdate,
  MaintenanceLog,
  Metric,
  MetricKind,
  Region,
  RegionBase,
  RegionUpdate,
  Schedule,
  ScheduleBase,
  ScheduleUpdate,
  Sensor,
  SensorBase,
  SensorUpdate,
  SyncModel,
  SystemSetting,
  SystemSettingType,
  SystemStatus,
  User,
  UserBase,
  UserKey,
  UserKeyKind,
  UserPushToken,
  UserPushTokenBase,
  UserSession,
  UserSessionBase,
  Zone,
  ZoneBase,
  ZoneLampBox,
  ZoneLampBoxBase,
  ZoneLampBoxUpdate,
  ZoneSchedule,
  ZoneScheduleBase,
  ZoneUpdate,
} from "$shared/types"
import { systemSettingSchema } from "$shared/types"
import { SYNC_MODELS, SyncModelName } from "$shared/helpers"
import postgres from "postgres"
import { sql, type Transaction } from "$server/db"
import { publicAPICache, PublicAPICacheModel } from "./cache.ts"
import { getLatestMetrics } from "../routes/metric.ts"

/** Sanitizes object by removing inappropriate fields */
function sanitize<T>(obj: Partial<T>): Partial<T> {
  return Object.keys(obj).reduce<Partial<T>>((acc, key) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (obj[key as keyof Partial<T>] !== undefined) {
      acc[key as keyof Partial<T>] = obj[key as keyof Partial<T>]
    }
    return acc
  }, {})
}

export class DbService {
  private sql = sql

  protected setSql(_sql: typeof sql | Transaction): void {
    this.sql = _sql
  }

  async isConnected(): Promise<boolean> {
    try {
      await sql`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  begin<T>(fn: (tx: DbService) => Promise<T>): Promise<T> {
    return this.sql.begin((transaction) => {
      const service = new DbService()
      service.setSql(transaction)
      return fn(service)
    }) as Promise<T>
  }

  async connect(): Promise<void> {
    await this.sql`SELECT 1`
  }

  async shutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 })
  }

  async findOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    id: number,
    command: postgres.PendingQuery<T[]>,
  ): Promise<null | T> {
    return cache.wrap(id, async () => (await command)[0])
  }

  async createOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const created = (await command)[0]
    if (created) {
      await cache.set(created.id, created)
    }
    return created
  }

  async updateOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const updated = (await command)[0]
    if (updated) {
      await cache.set(updated.id, updated)
    }
    return updated
  }

  async deleteOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const deleted = (await command)[0]
    if (deleted) {
      await cache.delete(deleted.id)
    }
    return deleted
  }

  buildMethods<M extends postgres.Row, C extends Partial<unknown>, U extends Partial<unknown>>(
    table: string,
    cache: PublicAPICacheModel<M>,
  ) {
    return {
      findOne: async ({ id }: { id: number }) =>
        this.findOne<M>(
          cache,
          id,
          sql`SELECT * FROM ${sql(table)} WHERE id = ${id}`,
        ),
      findChanged: async (updatedAtGt: Date): Promise<M[]> => {
        return await sql<
          M[]
        >`SELECT * FROM ${sql(table)} WHERE updated_at > ${updatedAtGt} ORDER BY updated_at DESC`
      },
      createOne: async ({ data }: { data: C }) =>
        this.createOne<M>(
          cache,
          sql<M[]>`
            INSERT INTO ${sql(table)}
            ${sql(sanitize(data))}
            RETURNING *`,
        ),
      updateOne: async (params: {
        id: number
        data: U
      }) =>
        this.updateOne<M>(
          cache,
          sql<M[]>`
            UPDATE ${sql(table)}
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`,
        ),
      deleteOne: async ({ id }: { id: number }) =>
        this.deleteOne<M>(
          cache,
          sql<M[]>`
            UPDATE ${sql(table)}
            SET updated_at = NOW(), deleted_at = NOW()
            WHERE id = ${id}
            RETURNING *`,
        ),
    }
  }

  user = {
    ...this.buildMethods<User, UserBase, Partial<UserBase>>(`users`, publicAPICache.user),
    findMany: async (): Promise<User[]> => {
      return sql<User[]>`
        SELECT u.*, uk.identification as username 
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        ORDER BY u.created_at DESC
      `
    },
    findChanged: async (updatedAtGt: Date): Promise<(User)[]> => {
      return sql<(User)[]>`
        SELECT u.*, uk.identification as username
        FROM users u
        LEFT JOIN user_keys uk
          ON u.id = uk.user_id AND uk.kind = 0
        WHERE u.updated_at > ${updatedAtGt}
        ORDER BY u.created_at DESC
      `
    },
  }

  zone = {
    ...this.buildMethods<Zone, ZoneBase, ZoneUpdate>(`zones`, publicAPICache.zone),
    findMany: async (): Promise<Zone[]> => {
      return await sql<Zone[]>`SELECT * FROM zones ORDER BY number ASC;`
    },
    findByGateway: async (gatewayId: number): Promise<Zone[]> => {
      return await sql<
        Zone[]
      >`SELECT * FROM zones WHERE deleted_at IS NULL AND gateway_id = ${gatewayId}`
    },
    findByRegion: async (regionId: number): Promise<Zone[]> => {
      return await sql<
        Zone[]
      >`SELECT * FROM zones WHERE deleted_at IS NULL AND region_id = ${regionId}`
    },
  }

  lampBox = {
    ...this.buildMethods<LampBox, LampBoxBase, LampBoxUpdate>(`lamp_boxes`, publicAPICache.lampBox),
    findMany: async (): Promise<LampBox[]> => {
      return await sql<LampBox[]>`
        SELECT * 
        FROM lamp_boxes
        ORDER BY mk_id ASC;`
    },
    findByGateway: async (gatewayId: number): Promise<LampBox[]> => {
      return await sql<
        LampBox[]
      >`SELECT * FROM lamp_boxes WHERE deleted_at IS NULL AND gateway_id = ${gatewayId}`
    },
    findByRegion: async (regionId: number): Promise<LampBox[]> => {
      return await sql<
        LampBox[]
      >`SELECT * FROM lamp_boxes WHERE deleted_at IS NULL AND region_id = ${regionId}`
    },
    resetEnergy: async ({ id }: { id: number }) =>
      this.updateOne(
        publicAPICache.lampBox,
        sql<LampBox[]>`
            UPDATE lamp_boxes
            SET updated_at = NOW(), energy_base_wh = -energy_curr_wh
            WHERE id = ${id}
            RETURNING *`,
      ),
    findPowerAnomalies: (): Promise<
      {
        lampBoxId: number
        lampBoxGbId: string
        profilesSumRatedPower: number
        actualPower: null | number
      }[]
    > => {
      return sql<
        {
          lampBoxId: number
          lampBoxGbId: string
          profilesSumRatedPower: number
          actualPower: null | number
        }[]
      >`
          WITH latest_on_off_metrics AS ( -- Find lamp's last on/off status. Used to figure out if lamp is on now
              SELECT DISTINCT ON (lamp_box_id)
                  lamp_box_id,
                  value AS on_off_status,
                  created_at
              FROM
                  metrics
              WHERE
                  kind = 7 -- On/Off metric
                  AND created_at >= NOW() - INTERVAL '3 minutes'
              ORDER BY
                  lamp_box_id, created_at DESC
          ),
          latest_off_metrics AS ( -- Find lamp's last off status. Used to figure out if lamp warmed up (3 min+) and power is stable
              SELECT DISTINCT ON (lamp_box_id)
                  lamp_box_id,
                  value AS on_off_status,
                  created_at
              FROM
                  metrics
              WHERE
                  kind = 7 -- On/Off metric
                  AND value = 0
                  AND created_at >= NOW() - INTERVAL '3 days' -- this is to make sure we always have a value, but avoid scanning all data
              ORDER BY
                  lamp_box_id, created_at DESC
          ),
          latest_power_metrics AS (
              SELECT DISTINCT ON (lamp_box_id)
                  lamp_box_id,
                  value AS power_value,
                  created_at
              FROM
                  metrics
              WHERE
                  kind = 2 -- Power metric
                  AND created_at >= NOW() - INTERVAL '3 minutes'
              ORDER BY
                  lamp_box_id, created_at DESC
          ),
          latest_online_metrics AS (
              SELECT DISTINCT ON (lamp_box_id)
                  lamp_box_id,
                  value AS online_status,
                  created_at
              FROM
                  metrics
              WHERE
                  kind = 9 -- Online/Offline metric
                  AND created_at >= NOW() - INTERVAL '15 minutes'
              ORDER BY
                  lamp_box_id, created_at DESC
          ),
          profile_expectations AS (
              SELECT
                  lb.id AS lamp_box_id,
                  Sum(lp.power_w) AS total_power_w
              FROM
                  lamp_boxes lb
              JOIN
                  lamps l ON lb.id = l.lamp_box_id AND l.deleted_at IS NULL
              JOIN
                  lamp_profiles lp ON l.profile_id = lp.id
              GROUP BY lb.id
          )
          SELECT
              lb.id AS lamp_box_id,
              lb.mk_id AS lamp_box_mk_id,
              CAST(pe.total_power_w AS INTEGER) AS profiles_sum_rated_power,
              lpm.power_value AS actual_power
          FROM
              lamp_boxes lb
          JOIN
              latest_on_off_metrics lonfm ON lb.id = lonfm.lamp_box_id
          JOIN
              latest_off_metrics loffm ON lb.id = loffm.lamp_box_id
          -- TODO: "LEFT JOIN latest_power_metrics" would allow to get all lamp boxes, even if there is no power metric for them. This is to be done after hardware fixes for missing metrics
          JOIN
              latest_power_metrics lpm ON lb.id = lpm.lamp_box_id
          JOIN
              latest_online_metrics lonlm ON lb.id = lonlm.lamp_box_id
          JOIN
              profile_expectations pe ON lb.id = pe.lamp_box_id
          WHERE
              lb.deleted_at IS NULL
              AND lonfm.on_off_status = 1
              AND lonfm.created_at > loffm.created_at + INTERVAL '3 minutes' -- lamp warmed up
              AND lonlm.online_status = 1 -- lamp is online
          GROUP BY
              lb.id, pe.total_power_w, lpm.power_value;
      `
    },
  }

  zoneLampBox = {
    ...this.buildMethods<ZoneLampBox, ZoneLampBoxBase, ZoneLampBoxUpdate>(
      `zone_lamp_boxes`,
      publicAPICache.zoneLampBox,
    ),
    findMany: async (): Promise<ZoneLampBox[]> => {
      return await sql<
        ZoneLampBox[]
      >`SELECT * FROM zone_lamp_boxes ORDER BY created_at DESC`
    },
    findByLampBox: async (lampBoxId: number): Promise<ZoneLampBox[]> => {
      return await sql<
        ZoneLampBox[]
      >`SELECT * FROM zone_lamp_boxes WHERE deleted_at IS NULL AND lamp_box_id = ${lampBoxId}`
    },
    findByZone: async (zoneId: number): Promise<ZoneLampBox[]> => {
      return await sql<
        ZoneLampBox[]
      >`SELECT * FROM zone_lamp_boxes WHERE deleted_at IS NULL AND zone_id = ${zoneId}`
    },
    restoreOne: async ({ id }: { id: number }) =>
      this.updateOne<ZoneLampBox>(
        publicAPICache.zoneLampBox,
        sql<ZoneLampBox[]>`
            UPDATE zone_lamp_boxes
            SET updated_at = NOW(), deleted_at = NULL
            WHERE id = ${id}
            RETURNING *`,
      ),
  }

  sensor = {
    ...this.buildMethods<Sensor, SensorBase, SensorUpdate>(`sensors`, publicAPICache.sensor),
    findMany: async (): Promise<Sensor[]> => {
      return await sql<Sensor[]>`
        SELECT *
        FROM sensors
        ORDER BY zone_id ASC`
    },
    findByGateway: async (gatewayId: number): Promise<Sensor[]> => {
      return await sql<
        Sensor[]
      >`SELECT * FROM sensors WHERE deleted_at IS NULL AND gateway_id = ${gatewayId}`
    },
    findByRegion: async (regionId: number): Promise<Sensor[]> => {
      return await sql<
        Sensor[]
      >`SELECT * FROM sensors WHERE deleted_at IS NULL AND region_id = ${regionId}`
    },
    findByZone: async (zoneId: number): Promise<Sensor[]> => {
      return await sql<
        Sensor[]
      >`SELECT * FROM sensors WHERE deleted_at IS NULL AND zone_id = ${zoneId}`
    },
  }

  command = {
    findMany: async (params: {
      source?: number
      lampBoxId?: number
      sensorId?: number
      zoneId?: number
      createdAtGt?: Date
    } = {}): Promise<Command[]> => {
      return await sql<Command[]>`
        SELECT *
        FROM commands
        WHERE TRUE
        ${params.source !== undefined ? sql`AND source = ${params.source}` : sql``}
        ${params.lampBoxId ? sql`AND lamp_box_id = ${params.lampBoxId}` : sql``}
        ${params.sensorId ? sql`AND sensor_id = ${params.sensorId}` : sql``}
        ${params.zoneId ? sql`AND zone_Id = ${params.zoneId}` : sql``}
        ${params.createdAtGt ? sql`AND created_at > ${params.createdAtGt}` : sql``}
        ORDER BY created_at DESC
        `
    },
    createOne: async ({ data }: { data: CommandBase }): Promise<Command> => {
      return (
        await sql<Command[]>`
            INSERT INTO commands
            ${sql(sanitize(data))}
            RETURNING *`
      )[0]
    },
  }

  gateway = {
    ...this.buildMethods<Gateway, GatewayBase, GatewayUpdate>(`gateways`, publicAPICache.gateway),
    findMany: async (): Promise<Gateway[]> => {
      return await sql<Gateway[]>`SELECT * FROM gateways ORDER BY mk_id ASC`
    },
    findByRegion: async (regionId: number): Promise<Gateway[]> => {
      return await sql<
        Gateway[]
      >`SELECT * FROM gateways WHERE deleted_at IS NULL AND region_id = ${regionId}`
    },
  }

  lampProfile = {
    ...this.buildMethods<LampProfile, LampProfileBase, LampProfileUpdate>(
      `lamp_profiles`,
      publicAPICache.lampProfile,
    ),
    findMany: async (): Promise<LampProfile[]> => {
      return await sql<
        LampProfile[]
      >`SELECT * FROM lamp_profiles ORDER BY name ASC`
    },
  }

  lamp = {
    ...this.buildMethods<Lamp, LampBase, LampUpdate>(
      `lamps`,
      publicAPICache.lamp,
    ),
    findMany: async (): Promise<Lamp[]> => {
      return await sql<Lamp[]>`SELECT * FROM lamps ORDER BY running_min DESC`
    },
    findByLampBox: async (lampBoxId: number): Promise<Lamp[]> => {
      return await sql<
        Lamp[]
      >`SELECT * FROM lamps WHERE deleted_at IS NULL AND lamp_box_id = ${lampBoxId}`
    },
    findByLampProfile: async (lampProfileId: number): Promise<Lamp[]> => {
      return await sql<
        Lamp[]
      >`SELECT * FROM lamps WHERE deleted_at IS NULL AND profile_id = ${lampProfileId}`
    },
  }

  metric = {
    findMany: async (params: {
      kind?: number
      lampBoxId?: number
      sensorId?: number
      gatewayId?: number
      createdAtGt?: Date
    } = {}): Promise<Metric[]> => {
      return await sql<Metric[]>`
        SELECT *
        FROM metrics
        WHERE TRUE
        ${params.kind !== undefined ? sql`AND kind = ${params.kind}` : sql``}
        ${params.lampBoxId ? sql`AND lamp_box_id = ${params.lampBoxId}` : sql``}
        ${params.sensorId ? sql`AND sensor_id = ${params.sensorId}` : sql``}
        ${params.gatewayId ? sql`AND gateway_id = ${params.gatewayId}` : sql``}
        ${params.createdAtGt ? sql`AND created_at > ${params.createdAtGt}` : sql``}
        ORDER BY created_at DESC;
      `
    },
    findLatestForEachLampBox: async (kind: MetricKind): Promise<Metric[]> => {
      return sql<Metric[]>`
        SELECT DISTINCT ON (lb.id) m.*
        FROM lamp_boxes lb
        JOIN metrics m ON lb.id = m.lamp_box_id AND m.kind=${kind}
        WHERE lb.deleted_at IS NULL
        ORDER BY lb.id, m.created_at DESC;
      `
    },
    findLatestForEachSensor: async (kind: MetricKind): Promise<Metric[]> => {
      return sql<Metric[]>`
        SELECT DISTINCT ON (s.id) m.*
        FROM sensors s
        JOIN metrics m ON s.id = m.sensor_id AND m.kind=${kind}
        WHERE s.deleted_at IS NULL
        ORDER BY s.id, m.created_at DESC;
      `
    },
    findLatestForEachGateway: async (kind: MetricKind): Promise<Metric[]> => {
      return sql<Metric[]>`
        SELECT DISTINCT ON (g.id) m.*
        FROM gateways g
        JOIN metrics m ON g.id = m.gateway_id AND m.kind=${kind}
        WHERE g.deleted_at IS NULL
        ORDER BY g.id, m.created_at DESC;
      `
    },
    createOne: async ({ data }: { data: Partial<Metric> }): Promise<Metric> => {
      return (
        await sql<Metric[]>`
            INSERT INTO metrics
            ${sql(sanitize(data))}
            RETURNING *`
      )[0]
    },
    createMany: async (
      { data }: { data: Partial<Metric>[] },
    ): Promise<Metric[]> => {
      return (
        await sql<Metric[]>`
            INSERT INTO metrics
            ${sql(data)}
            RETURNING *`
      )
    },
    findOnOffMetrics: (
      since: Date,
    ): Promise<
      (Metric & { lampBoxGbId?: string; sensorGbId?: string; gatewayGbId?: string })[]
    > => {
      return sql<(Metric & { lampBoxGbId?: string; sensorGbId?: string; gatewayGbId?: string })[]>`
        SELECT 
          DISTINCT ON (m.lamp_box_id, m.sensor_id, m.gateway_id) m.*,
          lb.mk_id AS lamp_box_mk_id,
          s.mk_id AS sensor_mk_id,
          g.mk_id AS gateway_mk_id
        FROM metrics m
          LEFT JOIN
            lamp_boxes lb ON lb.id = m.lamp_box_id
          LEFT JOIN
            sensors s ON s.id = m.sensor_id
          LEFT JOIN
            gateways g ON g.id = m.gateway_id
        WHERE m.kind = 9
        AND m.created_at >= ${since}
        ORDER BY m.lamp_box_id, m.sensor_id, m.gateway_id, m.created_at DESC;
      `
    },
    getRegularStats: async (
      params: {
        kind: MetricKind
        filter: DateFilter & { lampBoxId?: number | null; sensorId?: number; gatewayId?: number }
        interval: number
      },
    ): Promise<{ timeGroup: string; value: number | null }[]> => {
      const aggFunc = params.kind === MetricKind.ENERGY ? sql`MAX(agg_value)` : sql`SUM(agg_value)`
      const interval = `${params.interval} minutes`
      const groupByColumn = params.filter.sensorId
        ? sql`,m.sensor_id`
        : params.filter.gatewayId
        ? sql`,m.gateway_id`
        : sql`,m.lamp_box_id` /* Fallback to lampboxes, because their metrics (power and energy) are used on main page as stats for whole park. What that groupping by lampboxes does is that it will show the sum of all lampboxes in the park (max value of each lampbox in the time bucket). Without this, it would show the max of all metrics in the time bucket (that's only one device that has bigger values than others). */
      return sql<{ timeGroup: string; value: number | null }[]>`
        WITH time_buckets AS (
          SELECT generate_series(
            ${params.filter.from},
            ${params.filter.to},
            (${interval})::interval
          ) AS bucket_start
        ),
        -- Calculate AVG value in the 5min bucket for each entity
        entity_metrics AS (
          SELECT
            tb.bucket_start,
            MAX(m.value) AS agg_value -- we want max known value for a metric for a device inside the bucket, so if device reported few power metric within 5 min bucket - only max value of these metrics will be later summed with other devices, not all of the device's power metrics of that time bucket
            ${groupByColumn}
          FROM
            time_buckets tb
          LEFT JOIN
            metrics m ON m.created_at >= tb.bucket_start
                    AND m.created_at < tb.bucket_start + (${interval})::interval
                    AND m.kind = ${params.kind}
                    ${
        params.filter.lampBoxId ? sql`AND m.lamp_box_id = ${params.filter.lampBoxId}` : sql``
      }
                    ${
        params.filter.sensorId ? sql`AND m.sensor_id = ${params.filter.sensorId}` : sql``
      }
                    ${
        params.filter.gatewayId ? sql`AND m.gateway_id = ${params.filter.gatewayId}` : sql``
      }
          GROUP BY
            tb.bucket_start ${groupByColumn}
        )
        SELECT
          bucket_start as time_group,
          ${aggFunc} AS value
        FROM
          entity_metrics
        GROUP BY
          bucket_start
        ORDER BY
          bucket_start;
          `
    },
    getZoneStats: async (
      params: {
        kind: MetricKind
        filter: DateFilter
        interval: number
        zoneId: number
        gatewayId: number | null
      },
    ): Promise<{ timeGroup: string; value: number | null }[]> => {
      const aggFunc = params.kind === MetricKind.ENERGY ? sql`MAX(agg_value)` : sql`SUM(agg_value)`
      const interval = `${params.interval} minutes`
      const gatewayPart = params.gatewayId
        ? sql`UNION (SELECT b.id, b.created_at, b.value FROM base_metrics b WHERE b.gateway_id = ${params.gatewayId})`
        : sql``
      return sql<{ timeGroup: string; value: number | null }[]>`
        WITH time_buckets AS (
          SELECT generate_series(
            ${params.filter.from},
            ${params.filter.to},
            (${interval})::interval
          ) AS bucket_start
        ),
        base_metrics AS (
          SELECT * 
            FROM metrics m
            WHERE m.created_at >= ${params.filter.from}
              AND m.created_at < ${params.filter.to} + (${interval})::interval
              AND m.kind = ${params.kind}
        ),
        all_metrics AS (
          (SELECT b.id, b.created_at, b.value
            FROM base_metrics b
            WHERE b.lamp_box_id IN (SELECT lamp_box_id FROM zone_lamp_boxes WHERE zone_lamp_boxes.zone_id = ${params.zoneId})
          )
          ${gatewayPart}
          UNION
          (SELECT b.id, b.created_at, b.value
            FROM base_metrics b
            WHERE b.sensor_id IN (SELECT id FROM sensors WHERE sensors.zone_id = ${params.zoneId})
          )
        ),
        -- Calculate AVG value in the bucket
        averages AS (
          SELECT
            tb.bucket_start,
            MAX(m.value) AS agg_value
          FROM
            time_buckets tb
          LEFT JOIN
            all_metrics m ON m.created_at >= tb.bucket_start
                    AND m.created_at < tb.bucket_start + (${interval})::interval
          GROUP BY
            tb.bucket_start
        )
        SELECT
          bucket_start as time_group,
          ${aggFunc} AS value
        FROM
          averages
        GROUP BY
          bucket_start
        ORDER BY
          bucket_start;
          `
    },
    getCumulativeStats: (
      params: { kind: MetricKind.ENERGY; filter: DateFilter },
    ): Promise<{ timeGroup: string; value: string }[]> => {
      return sql<{ timeGroup: string; value: string }[]>`
        WITH time_buckets AS (
          SELECT generate_series(
            ${params.filter.from},
            ${params.filter.to},
            interval '5 minutes'
          ) AS bucket_start
        )
        -- Fetch latest value for each lampbox where created_at <= bucket_start + interval '5 minutes' (so if there are no row for this time bucket - we will get the latest known value anyway)
        SELECT 
          tb.bucket_start as time_group, 
          SUM(le.latest_value) AS value
        FROM 
          time_buckets tb
        LEFT JOIN LATERAL (
          WITH latest AS (
              SELECT
                m.lamp_box_id,
                MAX(m.created_at) AS latest_created_at
              FROM
                metrics m
              WHERE
                m.created_at < tb.bucket_start + interval '5 minutes'
                AND m.kind = ${params.kind}
                AND m.lamp_box_id IS NOT NULL
              GROUP BY
                m.lamp_box_id
            )
            SELECT
              m.created_at,
              m.lamp_box_id,
              m.value AS latest_value
            FROM 
              metrics m
            JOIN
              latest l ON m.lamp_box_id = l.lamp_box_id 
                      AND m.created_at = l.latest_created_at
            WHERE 
              m.kind = ${params.kind}
          ) le ON TRUE
        GROUP BY
          tb.bucket_start
        ORDER BY
          tb.bucket_start;
      `
    },
  }

  schedule = {
    ...this.buildMethods<Schedule, ScheduleBase, ScheduleUpdate>(
      `schedules`,
      publicAPICache.schedule,
    ),
    findMany: async (): Promise<Schedule[]> => {
      return await sql<
        Schedule[]
      >`SELECT * FROM schedules ORDER BY created_at DESC`
    },
  }

  zoneSchedule = {
    ...this.buildMethods<ZoneSchedule, ZoneScheduleBase, ZoneScheduleBase>(
      `zone_schedules`,
      publicAPICache.zoneSchedule,
    ),
    findMany: async (): Promise<ZoneSchedule[]> => {
      return await sql<
        ZoneSchedule[]
      >`SELECT * FROM zone_schedules ORDER BY created_at DESC`
    },
    findByZone: async (zoneId: number): Promise<ZoneSchedule[]> => {
      return await sql<
        ZoneSchedule[]
      >`SELECT * FROM zone_schedules WHERE deleted_at IS NULL AND zone_id = ${zoneId}`
    },
    restoreOne: async ({ id }: { id: number }) =>
      this.updateOne<ZoneSchedule>(
        publicAPICache.zoneSchedule,
        sql<ZoneSchedule[]>`
            UPDATE zone_schedules
            SET updated_at = NOW(), deleted_at = NULL
            WHERE id = ${id}
            RETURNING *`,
      ),
  }

  alert = {
    findOne: async (
      params: {
        id?: number
        lampBoxId?: number
        sensorId?: number
        gatewayId?: number
        type?: AlertType
        statusNot?: number
        orderBy?: { createdAt: "desc" }
      },
    ): Promise<null | Alert> => {
      const [alert] = await sql<[Alert]>`
          SELECT *
          FROM alerts
          WHERE TRUE
          ${params.id ? sql`AND id = ${params.id}` : sql``}
          ${params.lampBoxId ? sql`AND lamp_box_id = ${params.lampBoxId}` : sql``}
          ${params.sensorId ? sql`AND sensor_id = ${params.sensorId}` : sql``}
          ${params.gatewayId ? sql`AND gateway_id = ${params.gatewayId}` : sql``}
          ${params.type !== undefined ? sql`AND type = ${params.type}` : sql``}
          ${params.statusNot !== undefined ? sql`AND status != ${params.statusNot}` : sql``}
          ${params.orderBy ? sql`ORDER BY created_at DESC` : sql``}
          LIMIT 1
        `
      return alert || null
    },
    findMany: async (): Promise<Alert[]> => {
      return await sql<Alert[]>`SELECT * FROM alerts ORDER BY created_at DESC`
    },
    createOne: async (params: { data: Partial<AlertBase> }): Promise<Alert> => {
      return (
        await sql<Alert[]>`
            INSERT INTO alerts
            ${sql(sanitize(params.data))}
            RETURNING *`
      )[0]
    },
    createMany: async (
      params: { data: Partial<AlertBase>[] },
    ): Promise<Alert[]> => {
      return (
        await sql<Alert[]>`
            INSERT INTO alerts
            ${sql(params.data)}
            RETURNING *`
      )
    },
    updateOne: async (
      params:
        & { data: Partial<AlertBase> }
        & ({ id: number } | { type: AlertType }),
    ): Promise<Alert> => {
      return (
        await sql<Alert[]>`
            UPDATE alerts
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE TRUE
              ${"id" in params && params.id ? sql`AND id = ${params.id}` : sql``}
              ${"type" in params && params.type ? sql`AND type = ${params.type}` : sql``}
            RETURNING *`
      )[0]
    },
  }

  maintenanceLog = {
    findMany: async (): Promise<MaintenanceLog[]> => {
      return await sql<
        MaintenanceLog[]
      >`SELECT * FROM maintenance_logs ORDER BY updated_at DESC`
    },
    createOne: async (params: {
      data: MaintenanceLog
    }): Promise<MaintenanceLog> => {
      return (
        await sql<MaintenanceLog[]>`
            INSERT INTO maintenance_logs
            ${sql(sanitize(params.data))}
            RETURNING *`
      )[0]
    },
    updateOne: async (params: {
      id: number
      data: MaintenanceLog
    }): Promise<MaintenanceLog> => {
      return (
        await sql<MaintenanceLog[]>`
            UPDATE maintenance_logs
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
    },
  }

  systemStatus = {
    findMany: async (): Promise<SystemStatus[]> => {
      return await sql<
        SystemStatus[]
      >`SELECT * FROM system_statuses ORDER BY created_at DESC`
    },
    createOne: async (params: {
      data: SystemStatus
    }): Promise<SystemStatus> => {
      return (
        await sql<SystemStatus[]>`
            INSERT INTO system_statuses
            ${sql(sanitize(params.data))}
            RETURNING *`
      )[0]
    },
  }

  region = {
    ...this.buildMethods<Region, RegionBase, RegionUpdate>(
      `regions`,
      publicAPICache.region,
    ),
    findMany: async (): Promise<Region[]> => {
      return await sql<Region[]>`SELECT * FROM regions ORDER BY name ASC`
    },
  }

  userSession = {
    createOne: async (params: {
      data: UserSessionBase
    }): Promise<UserSession> => {
      const created = (
        await sql<UserSession[]>`
            INSERT INTO user_sessions
            ${sql(sanitize(params.data))}
            RETURNING *`
      )[0]
      if (created) {
        await publicAPICache.userSession.set(created.id, created)
      }
      return created
    },
    findOne: async ({ id }: { id: number }): Promise<null | UserSession> => {
      return publicAPICache.userSession.wrap(
        id,
        async () => (await sql<UserSession[]>`SELECT * FROM user_sessions WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
    }): Promise<UserSession[]> => {
      return await sql<
        UserSession[]
      >`SELECT * FROM user_sessions 
      WHERE TRUE
      ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
      ORDER BY created_at DESC`
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserSessionBase>
    }): Promise<UserSession> => {
      const updated = (
        await sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
      if (updated) {
        await publicAPICache.userSession.set(updated.id, updated)
      }
      return updated
    },
    updateMany: async (params: {
      userId?: number
      expiresAt?: { lte?: Date }
      ids?: number[]
      data: Partial<UserSessionBase>
    }): Promise<UserSession[]> => {
      return (
        await sql<UserSession[]>`
            UPDATE user_sessions
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE TRUE
            ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
            ${params.expiresAt?.lte ? sql`AND expires_at <= ${params.expiresAt.lte}` : sql``}
            ${params.ids ? sql`AND id = ANY(${sql.array(params.ids)}::int[])` : sql``}
            RETURNING *`
      )
    },
  }

  userKey = {
    findOne: async (params: {
      id?: number
      userId?: number
      kind?: UserKeyKind
      identification?: string
    }): Promise<null | UserKey> => {
      const found = (
        await sql<UserKey[]>`
            SELECT *
            FROM user_keys
            WHERE TRUE
            ${params.id ? sql`AND id = ${params.id}` : sql``}
            ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
            ${params.kind !== undefined ? sql`AND kind = ${params.kind}` : sql``}
            ${params.identification ? sql`AND identification = ${params.identification}` : sql``}
            LIMIT 1`
      )[0]
      if (found) {
        await publicAPICache.userKey.set(found.id, found)
      }
      return found
    },
    findById: async (id: number): Promise<UserKey | null> => {
      return publicAPICache.userKey.wrap(
        id,
        async () => (await sql<UserKey[]>`SELECT * FROM user_keys WHERE id = ${id}`)[0],
      )
    },
    findMany: async (params: {
      userId?: number
      kind?: UserKeyKind
    }): Promise<UserKey[]> => {
      return await sql<UserKey[]>`
        SELECT *
        FROM user_keys
        WHERE TRUE
        ${params.userId ? sql`AND user_id = ${params.userId}` : sql``}
        ${params.kind !== undefined ? sql`AND kind = ${params.kind}` : sql``}
        ORDER BY created_at DESC`
    },
    createOne: async (params: {
      userId: number
      kind: number
      identification: string
      secret: string
    }): Promise<UserKey> => {
      const created = (
        await sql<UserKey[]>`
            INSERT INTO user_keys (user_id, kind, identification, secret)
            VALUES (${params.userId}, ${params.kind}, ${params.identification}, ${params.secret})
            RETURNING *`
      )[0]
      if (created) {
        await publicAPICache.userKey.set(created.id, created)
      }
      return created
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserKey>
    }): Promise<UserKey> => {
      const updated = (
        await sql<UserKey[]>`
            UPDATE user_keys
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
      if (updated) {
        await publicAPICache.userKey.set(updated.id, updated)
      }
      return updated
    },
    deleteOne: async (params: { id: number }): Promise<void> => {
      const deleted = await sql<UserKey[]>`
            DELETE FROM user_keys
            WHERE id = ${params.id}
            RETURNING *`
      if (deleted) {
        await publicAPICache.userKey.delete(params.id)
      }
    },
  }

  userPushToken = {
    findAll: async (): Promise<UserPushToken[]> => {
      return await sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL 
        ORDER BY created_at DESC`
    },
    findMany: async (params: {
      userId: number
    }): Promise<UserPushToken[]> => {
      return await sql<UserPushToken[]>`
        SELECT *
        FROM user_push_tokens
        WHERE deleted_at IS NULL AND user_id = ${params.userId} 
        ORDER BY created_at DESC`
    },
    findOne: async (
      { deviceId, userId }: { deviceId: string; userId: number },
    ): Promise<null | UserPushToken> => {
      return (
        await sql<
          UserPushToken[]
        >`SELECT * FROM user_push_tokens WHERE deleted_at is NULL AND device_id = ${deviceId} AND user_id = ${userId}`
      )[0]
    },
    createOne: async (params: UserPushTokenBase) => {
      return (
        await sql<UserPushToken[]>`
            INSERT INTO user_push_tokens
            ${sql(sanitize(params))}
            RETURNING *`
      )[0]
    },
    updateOne: async (params: {
      id: number
      data: Partial<UserPushToken>
    }): Promise<UserPushToken> => {
      return (
        await sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), ${sql(sanitize(params.data))}
            WHERE id = ${params.id}
            RETURNING *`
      )[0]
    },
    deleteOne: async (params: { deviceId: string; userId?: number }): Promise<void> => {
      await sql<UserPushToken[]>`
        UPDATE user_push_tokens
          SET updated_at = NOW(), deleted_at = NOW()
          WHERE device_id = ${params.deviceId} ${
        params.userId ? sql`AND user_id = ${params.userId}` : sql``
      }
          RETURNING *`
    },
    deleteByUser: async (params: { userId: number }): Promise<void> => {
      await sql<UserPushToken[]>`
            UPDATE user_push_tokens
            SET updated_at = NOW(), deleted_at = NOW()
            WHERE user_id = ${params.userId}
            RETURNING *`
    },
  }
  systemSetting = {
    findOne: async ({ id }: { id: SystemSettingType }): Promise<null | SystemSetting> => {
      const result =
        (await sql<[SystemSetting]>`SELECT * FROM system_settings WHERE id = ${id} LIMIT 1`)[0]
      return result ? systemSettingSchema.parse(result) : null
    },
    findMany: async (): Promise<SystemSetting[]> =>
      (await sql<SystemSetting[]>`SELECT * FROM system_settings`).map((s) =>
        systemSettingSchema.parse(s)
      ),
    updateOne: async (
      params: { data: Partial<SystemSetting["body"]>; updatedBy?: number; id: SystemSettingType },
    ): Promise<null | SystemSetting> => {
      const result = (await sql<[SystemSetting]>`
            UPDATE system_settings
            SET updated_at = NOW()
            ${params.updatedBy ? sql`,updated_by = ${params.updatedBy}` : sql``}
            ${params.data ? sql`,body = body || ${sql.json(sanitize(params.data))}::jsonb` : sql``}
            WHERE id = ${params.id}
            RETURNING *`)[0]
      return result ? systemSettingSchema.parse(result) : null
    },
    createOne: async ({ data }: { data: Partial<SystemSetting> }): Promise<SystemSetting> =>
      systemSettingSchema.parse(
        (await this.sql<[SystemSetting]>`INSERT INTO system_settings ${
          sql(sanitize(data))
        } RETURNING *`)[0],
      ),
  }

  syncData = async (
    callback: (model: SyncModelName, data: SyncModel[]) => void,
    lastSyncAt: number,
  ) => {
    for (let i = 0; i < SYNC_MODELS.length; i += 1) {
      const model = SYNC_MODELS[i]
      let data = []
      if (model === SyncModelName.metric) {
        data = await getLatestMetrics()
      } else if ("findChanged" in db[model] && typeof db[model].findChanged === "function") {
        data = await db[model].findChanged(lastSyncAt)
      } else {
        data = await db[model].findMany()
      }
      callback(model, data)
    }
  }
}

export const db = new DbService()
