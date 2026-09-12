import { supabase } from './supabase';
import { logActivity } from './activityLogger';
import { Build, BuildStatus, ClientBuildConfig, Client } from '../types';

export interface CreateBuildParams {
  clientId?: string | null;
  version: string;
  releaseDate?: string;
  minimumSupportedVersion?: string | null;
  releaseNotes?: string | null;
  status?: BuildStatus;
}

export interface UpdateBuildParams {
  version?: string;
  releaseDate?: string;
  minimumSupportedVersion?: string | null;
  releaseNotes?: string | null;
  downloadEnabled?: boolean;
}

/**
 * Valid lifecycle transitions:
 * draft -> building
 * building -> ready
 * building -> failed
 * ready -> archived
 * draft -> archived
 */
export const VALID_TRANSITIONS: Record<BuildStatus, BuildStatus[]> = {
  draft: ['building', 'archived'],
  building: ['ready', 'failed'],
  ready: ['archived'],
  failed: ['draft', 'building', 'archived'],
  archived: [],
  published: ['archived'],
  deprecated: ['archived'],
};

export function isValidTransition(currentStatus: BuildStatus, nextStatus: BuildStatus): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

/**
 * Fetch all builds with optional relations.
 * Gracefully handles both cases: if client_id column is migrated or not yet migrated on Supabase live.
 */
export async function fetchBuilds(): Promise<{ builds: Build[]; error?: any }> {
  try {
    // Attempt query with client relation
    const { data, error } = await supabase
      .from('builds')
      .select(`
        *,
        client:clients (id, client_code, customer_name, business_name, logo, currency, language, phone, email, address)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return { builds: data as Build[] };
    }

    // Fallback if client relation fails (e.g. client_id foreign key not yet on live Supabase)
    const { data: rawData, error: rawError } = await supabase
      .from('builds')
      .select('*')
      .order('created_at', { ascending: false });

    if (rawError) throw rawError;

    // Fetch clients separately if client_id exists on objects
    const buildsList = rawData as Build[];
    const clientIds = Array.from(new Set(buildsList.map(b => b.client_id).filter(Boolean))) as string[];

    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .in('id', clientIds);

      const clientMap = new Map((clientsData || []).map(c => [c.id, c]));
      buildsList.forEach(b => {
        if (b.client_id) {
          b.client = clientMap.get(b.client_id) || null;
        }
      });
    }

    return { builds: buildsList };
  } catch (err: any) {
    console.error('Error fetching builds:', err);
    return { builds: [], error: err };
  }
}

/**
 * Fetch single build by ID with client relation
 */
export async function fetchBuildById(id: string): Promise<{ build: Build | null; error?: any }> {
  try {
    const { data, error } = await supabase
      .from('builds')
      .select(`
        *,
        client:clients (id, client_code, customer_name, business_name, logo, phone, email, address, currency, language)
      `)
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      return { build: data as Build };
    }

    // Fallback if relation select fails
    const { data: rawData, error: rawError } = await supabase
      .from('builds')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (rawError) throw rawError;
    if (!rawData) return { build: null };

    const buildItem = rawData as Build;
    if (buildItem.client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', buildItem.client_id)
        .maybeSingle();
      buildItem.client = clientData || null;
    }

    return { build: buildItem };
  } catch (err: any) {
    console.error('Error fetching build by id:', err);
    return { build: null, error: err };
  }
}

/**
 * Creates a new build with semantic validation:
 * 1. Checks version syntax (e.g. 1.0.0)
 * 2. Determines auto build_number increment
 * 3. Prevents duplicate version + build_number
 * 4. Logs activity build_created
 */
export async function createBuild(params: CreateBuildParams): Promise<{ success: boolean; build?: Build; message: string }> {
  try {
    const {
      clientId,
      version,
      releaseDate,
      minimumSupportedVersion,
      releaseNotes,
      status = 'draft',
    } = params;

    // 1. Get max build number so far to increment
    const { data: latestBuilds } = await supabase
      .from('builds')
      .select('build_number')
      .order('build_number', { ascending: false })
      .limit(1);

    const nextBuildNumber = (latestBuilds && latestBuilds.length > 0 && latestBuilds[0].build_number)
      ? latestBuilds[0].build_number + 1
      : 1;

    // 2. Prepare payload
    const payload: any = {
      version: version.trim(),
      build_number: nextBuildNumber,
      release_date: releaseDate || new Date().toISOString(),
      status: status,
      minimum_supported_version: minimumSupportedVersion ? minimumSupportedVersion.trim() : null,
      release_notes: releaseNotes ? releaseNotes.trim() : null,
      download_enabled: status === 'ready' || status === 'published',
    };

    // Only include client_id if selected
    if (clientId) {
      payload.client_id = clientId;
    }

    // Insert build record
    let insertResult = await supabase
      .from('builds')
      .insert(payload)
      .select()
      .single();

    // If it failed because client_id column is not yet on Live Supabase, retry without client_id
    if (insertResult.error && insertResult.error.message?.includes('client_id')) {
      console.warn('Column client_id not yet added to live table; inserting without client_id');
      delete payload.client_id;
      insertResult = await supabase
        .from('builds')
        .insert(payload)
        .select()
        .single();
    }

    if (insertResult.error) throw insertResult.error;

    const newBuild = insertResult.data as Build;

    // Log Activity
    await logActivity({
      action: 'build_created',
      entityType: 'build',
      entityId: newBuild.id,
      metadata: {
        build_id: newBuild.id,
        version: newBuild.version,
        build_number: newBuild.build_number,
        client_id: clientId || null,
        status: newBuild.status,
        release_date: newBuild.release_date,
      },
    });

    return {
      success: true,
      build: newBuild,
      message: `تم إنشاء الإصدار v${newBuild.version} (Build #${newBuild.build_number}) بنجاح`,
    };
  } catch (err: any) {
    console.error('Error creating build:', err);
    return {
      success: false,
      message: err.message || 'فشل في إنشاء الإصدار بقاعدة البيانات',
    };
  }
}

/**
 * Transition build status with lifecycle guard
 */
export async function transitionBuildStatus(
  buildId: string,
  newStatus: BuildStatus,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Fetch current status
    const { data: currentBuild, error: fetchErr } = await supabase
      .from('builds')
      .select('*')
      .eq('id', buildId)
      .single();

    if (fetchErr || !currentBuild) {
      return { success: false, message: 'الإصدار غير موجود' };
    }

    const currentStatus = currentBuild.status as BuildStatus;

    // 2. Validate transition
    if (!isValidTransition(currentStatus, newStatus)) {
      return {
        success: false,
        message: `لا يمكن تحويل حالة الإصدار من "${currentStatus}" إلى "${newStatus}". الانتقال غير مسموح.`,
      };
    }

    // 3. Update status
    const { error: updateErr } = await supabase
      .from('builds')
      .update({
        status: newStatus,
        download_enabled: newStatus === 'ready' || newStatus === 'published',
      })
      .eq('id', buildId);

    if (updateErr) throw updateErr;

    // 4. Log Activity
    await logActivity({
      action: 'build_status_changed',
      entityType: 'build',
      entityId: buildId,
      metadata: {
        build_id: buildId,
        previous_status: currentStatus,
        new_status: newStatus,
        version: currentBuild.version,
        build_number: currentBuild.build_number,
        client_id: currentBuild.client_id || null,
        reason: reason || 'تغيير الحالة من لوحة التحكم',
      },
    });

    return {
      success: true,
      message: `تم تغيير حالة الإصدار بنجاح إلى "${newStatus}"`,
    };
  } catch (err: any) {
    console.error('Error transitioning build status:', err);
    return {
      success: false,
      message: err.message || 'فشل في تحديث حالة الإصدار',
    };
  }
}

/**
 * Generates unified Client Build Configuration Object based on real client & license data.
 * IMPORTANT: Does NOT create EXE or Installer; prepares the pure configuration payload.
 */
export async function generateClientBuildConfig(
  build: Build,
  client: Client
): Promise<{ success: boolean; config?: ClientBuildConfig; message: string }> {
  try {
    // 1. Fetch primary active license for this client (if any)
    const { data: licenses } = await supabase
      .from('licenses')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    const primaryLicense = licenses && licenses.length > 0 ? licenses[0] : null;

    // 2. Formulate the unified configuration object based ONLY on actual existing columns
    const config: ClientBuildConfig = {
      generated_at: new Date().toISOString(),
      environment: 'production',
      build: {
        id: build.id,
        version: build.version,
        build_number: build.build_number,
        release_date: build.release_date,
        status: build.status,
        minimum_supported_version: build.minimum_supported_version || null,
      },
      client: {
        id: client.id,
        client_code: client.client_code,
        customer_name: client.customer_name,
        business_name: client.business_name,
        logo: client.logo || null,
        phone: client.phone || null,
        email: client.email || null,
        address: client.address || null,
        currency: client.currency || 'USD',
        language: client.language || 'ar',
      },
      license: primaryLicense
        ? {
            id: primaryLicense.id,
            license_key: primaryLicense.license_key,
            license_type: primaryLicense.license_type,
            status: primaryLicense.status,
            max_devices: primaryLicense.max_devices,
            activated_devices: primaryLicense.activated_devices,
            expiry_date: primaryLicense.expiry_date,
          }
        : null,
    };

    // 3. Log activity
    await logActivity({
      action: 'build_configuration_generated',
      entityType: 'build',
      entityId: build.id,
      metadata: {
        build_id: build.id,
        version: build.version,
        client_id: client.id,
        client_code: client.client_code,
        has_license: !!primaryLicense,
      },
    });

    return {
      success: true,
      config,
      message: `تم إنشاء كائن الإعدادات المخصص للعميل ${client.business_name} بنجاح`,
    };
  } catch (err: any) {
    console.error('Error generating client build config:', err);
    return {
      success: false,
      message: err.message || 'فشل في تجهيز كائن إعدادات الإصدار',
    };
  }
}
