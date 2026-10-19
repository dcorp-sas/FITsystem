import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme';
import { Avatar, Card, Muted, PrimaryButton, ScreenHeader } from '../components/ui';
import { Icon } from '../components/icon';
import { portal, type MemberInfo, type OrgInfo } from '../lib/api';
import { showToast } from '../lib/toast';

const MAX_PHOTO_CHARS = 480_000;

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

export function ProfileScreen({
  member: initialMember,
  org,
  onBack,
  onUpdated,
}: {
  member: MemberInfo;
  org: OrgInfo;
  onBack: () => void;
  onUpdated: (member: MemberInfo) => void;
}) {
  const [member, setMember] = useState<MemberInfo>(initialMember);
  const [firstName, setFirstName] = useState(initialMember.firstName ?? '');
  const [lastName, setLastName] = useState(initialMember.lastName ?? '');
  const [documentNumber, setDocumentNumber] = useState(initialMember.documentNumber ?? '');
  const [phone, setPhone] = useState(initialMember.phone ?? '');
  const [email, setEmail] = useState(initialMember.email ?? '');
  const [address, setAddress] = useState(initialMember.address ?? '');
  const [city, setCity] = useState(initialMember.city ?? '');
  const [emergencyName, setEmergencyName] = useState(initialMember.emergencyName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(initialMember.emergencyPhone ?? '');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  function applyMember(next: MemberInfo) {
    setMember(next);
    setFirstName(next.firstName ?? '');
    setLastName(next.lastName ?? '');
    setDocumentNumber(next.documentNumber ?? '');
    setPhone(next.phone ?? '');
    setEmail(next.email ?? '');
    setAddress(next.address ?? '');
    setCity(next.city ?? '');
    setEmergencyName(next.emergencyName ?? '');
    setEmergencyPhone(next.emergencyPhone ?? '');
    onUpdated(next);
  }

  useEffect(() => {
    let mounted = true;
    portal
      .me()
      .then((res) => {
        if (mounted) applyMember(res.member);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast('Sin permiso', 'Necesitamos acceso a tus fotos para cambiar el avatar.', 'error');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset.base64) return;
      const mime = asset.mimeType || 'image/jpeg';
      const dataUrl = `data:${mime};base64,${asset.base64}`;
      if (dataUrl.length > MAX_PHOTO_CHARS) {
        showToast('Foto muy grande', 'Probá con una imagen más chica.', 'error');
        return;
      }

      setUploading(true);
      setMember((m) => ({ ...m, photoUrl: dataUrl }));
      const { member: updated } = await portal.updateProfile({ photoUrl: dataUrl });
      applyMember(updated);
      showToast('Listo', 'Actualizamos tu foto de perfil.', 'success');
    } catch (err) {
      showToast('No se pudo', err instanceof Error ? err.message : 'Intentá de nuevo.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { member: updated } = await portal.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        documentNumber: documentNumber.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        emergencyName: emergencyName.trim(),
        emergencyPhone: emergencyPhone.trim(),
      });
      applyMember(updated);
      showToast('Datos guardados', 'Tu perfil quedó actualizado.', 'success');
    } catch (err) {
      showToast('No se pudo guardar', err instanceof Error ? err.message : 'Intentá de nuevo.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 6) {
      showToast('Clave muy corta', 'Usá al menos 6 caracteres.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('No coinciden', 'Las dos claves deben ser iguales.', 'error');
      return;
    }
    setChanging(true);
    try {
      await portal.changePassword(newPassword, currentPassword || undefined);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Clave actualizada', 'Usá tu nueva clave la próxima vez.', 'success');
    } catch (err) {
      showToast('No se pudo', err instanceof Error ? err.message : 'Intentá de nuevo.', 'error');
    } finally {
      setChanging(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Mi perfil" subtitle={org.name} onBack={onBack} />

      <Card>
        <View style={styles.identity}>
          <Pressable onPress={pickPhoto} disabled={uploading} style={styles.avatarWrap}>
            <Avatar name={member.name} size={82} uri={member.photoUrl} />
            <View style={styles.avatarBadge}>
              <Icon name={uploading ? 'hourglass-outline' : 'camera-outline'} size={15} color="#fff" />
            </View>
          </Pressable>
          <View style={styles.identityText}>
            <Text style={styles.name}>{member.name}</Text>
            {!!member.memberCode && <Muted>Legajo {member.memberCode}</Muted>}
            <Pressable onPress={pickPhoto} disabled={uploading} hitSlop={6}>
              <Text style={styles.link}>{uploading ? 'Subiendo…' : 'Cambiar foto'}</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Text style={styles.section}>Datos personales</Text>
      <Card style={styles.formCard}>
        <Field label="Nombre" value={firstName} onChangeText={setFirstName} placeholder="Juan" autoCapitalize="words" />
        <Field label="Apellido" value={lastName} onChangeText={setLastName} placeholder="Pérez" autoCapitalize="words" />
        <Field label="DNI" value={documentNumber} onChangeText={setDocumentNumber} placeholder="30123456" keyboardType="number-pad" />
      </Card>

      <Text style={styles.section}>Contacto</Text>
      <Card style={styles.formCard}>
        <Field label="Teléfono" value={phone} onChangeText={setPhone} placeholder="11 2345 6789" keyboardType="phone-pad" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="juan@mail.com" keyboardType="email-address" autoCapitalize="none" />
        <Field label="Dirección" value={address} onChangeText={setAddress} placeholder="Av. Siempre Viva 742" autoCapitalize="sentences" />
        <Field label="Ciudad" value={city} onChangeText={setCity} placeholder="Buenos Aires" autoCapitalize="words" />
      </Card>

      <Text style={styles.section}>Contacto de emergencia</Text>
      <Card style={styles.formCard}>
        <Field label="Nombre" value={emergencyName} onChangeText={setEmergencyName} placeholder="María Pérez" autoCapitalize="words" />
        <Field label="Teléfono" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="11 9876 5432" keyboardType="phone-pad" />
      </Card>

      <PrimaryButton label="Guardar cambios" onPress={save} loading={saving} icon="checkmark" />

      <Text style={styles.section}>Seguridad</Text>
      <Card style={styles.formCard}>
        <Field label="Clave actual (si ya tenés una)" value={currentPassword} onChangeText={setCurrentPassword} placeholder="••••••" autoCapitalize="none" />
        <Field label="Nueva clave" value={newPassword} onChangeText={setNewPassword} placeholder="Mínimo 6 caracteres" autoCapitalize="none" />
        <Field label="Repetir nueva clave" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••" autoCapitalize="none" />
        <PrimaryButton label="Actualizar clave" onPress={changePassword} loading={changing} variant="ghost" icon="lock-closed-outline" />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatarWrap: { position: 'relative' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800' },
  link: { color: colors.primaryLight, fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  section: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: spacing.sm, letterSpacing: 0.2 },
  formCard: { gap: spacing.sm },
  field: { gap: 4 },
  label: { color: colors.textMuted, fontSize: 12.5 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
  },
});
