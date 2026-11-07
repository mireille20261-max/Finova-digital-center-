import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, type FormEvent } from "react";
import { 
  ArrowLeft, Download, LayoutDashboard, Trash2, Pencil, 
  Search, UserPlus, FileSpreadsheet, Eye, RotateCcw, Building2, School
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Confirm } from "@/components/admin/common";
import { loadTeachers, saveTeachers, storageErrorMessage, type Teacher } from "@/lib/masternote/storage";
import { exportTable, downloadBlob } from "@/lib/masternote/excel";
import { CLASSES } from "@/lib/masternote/classes";

export const Route = createFileRoute("/masternote_/enseignants")({
  ssr: false,
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Enrôlement Enseignants – Public & Privé | FINOVA" },
      { name: "description", content: "Gestion et enrôlement des enseignants du secteur public et privé." },
    ],
  }),
  component: TeacherEnrollmentModule,
});

type Sector = "public" | "prive";
type PublicStatus = "ACDPE" | "FE" | "AME";

interface FormState {
  matricule: string;
  identifiantAnpe: string;
  nom: string;
  prenoms: string;
  sexe: "M" | "F" | "";
  naissance: string;
  lieuNaissance: string;
  nationalite: string;
  telephone: string;
  email: string;
  ifu: string;
  npi: string;
  premierePriseService: string;
  statut: string;
  classe: string;
  affectation: string;
}

const emptyForm: FormState = {
  matricule: "",
  identifiantAnpe: "",
  nom: "",
  prenoms: "",
  sexe: "",
  naissance: "",
  lieuNaissance: "",
  nationalite: "Béninoise",
  telephone: "",
  email: "",
  ifu: "",
  npi: "",
  premierePriseService: "",
  statut: "",
  classe: "",
  affectation: "",
};

function TeacherEnrollmentModule() {
  const [sector, setSector] = useState<Sector>("public");
  const [priveTab, setPriveTab] = useState<"formulaire" | "liste">("formulaire");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTeachers().then(setTeachers).catch((e) => toast.error(storageErrorMessage(e)));
  }, []);

  const isFormDirty = useMemo(() => {
    return Object.entries(form).some(([k, v]) => k !== "nationalite" && v.trim() !== "");
  }, [form]);

  // Filtrage par secteur
  const publicTeachers = useMemo(() => {
    return teachers.filter((t) => t.statut === "ACDPE" || t.statut === "FE" || t.statut === "AME" || t.statut === "ACDPE/FE");
  }, [teachers]);

  const priveTeachers = useMemo(() => {
    return teachers.filter((t) => t.statut === "Enseignants du privé" || (!t.statut && !t.matricule));
  }, [teachers]);

  const activeList = sector === "public" ? publicTeachers : priveTeachers;

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeList.filter((t) => {
      const matchQuery = !q || `${t.nom} ${t.prenoms} ${t.matricule ?? ""} ${t.identifiantAnpe ?? ""} ${t.ifu ?? ""}`.toLowerCase().includes(q);
      const matchStatus = !statusFilter || t.statut === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [activeList, search, statusFilter]);

  function handleResetForm() {
    if (isFormDirty) {
      setShowResetConfirm(true);
    } else {
      setForm(emptyForm);
      setEditId(null);
      setError("");
    }
  }

  function confirmReset() {
    setForm(emptyForm);
    setEditId(null);
    setError("");
    setShowResetConfirm(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Validations communes
    if (!form.nom.trim()) return setError("Le nom est obligatoire.");
    if (!form.prenoms.trim()) return setError("Le prénom est obligatoire.");
    if (!form.sexe) return setError("Le sexe est obligatoire.");
    if (!form.naissance) return setError("La date de naissance est obligatoire.");
    if (!form.lieuNaissance.trim()) return setError("Le lieu de naissance est obligatoire.");
    if (!form.nationalite.trim()) return setError("La nationalité est obligatoire.");
    if (!form.telephone.trim()) return setError("Le numéro de téléphone est obligatoire.");
    if (!form.email.trim()) return setError("L'adresse e-mail est obligatoire.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Format d'e-mail invalide.");

    // Validation IFU : exactement 13 chiffres
    const cleanIfu = form.ifu.trim().replace(/\s+/g, "");
    if (!cleanIfu) return setError("Le numéro IFU est obligatoire.");
    if (!/^\d{13}$/.test(cleanIfu)) {
      return setError("Le numéro IFU doit comporter exactement 13 chiffres.");
    }

    if (!form.premierePriseService) {
      return setError("La date de première prise de service est obligatoire.");
    }

    // Validation spécifique Public
    if (sector === "public") {
      if (!form.statut) return setError("Le choix du statut (ACDPE, FE ou AME) est obligatoire.");
      if (!form.matricule.trim()) return setError("Le matricule est obligatoire pour les enseignants du public.");
    }

    const assignedStatus = sector === "public" ? form.statut : "Enseignants du privé";

    const payload: Teacher = {
      id: editId ?? Math.max(0, ...teachers.map((t) => t.id)) + 1,
      nom: form.nom.trim().toUpperCase(),
      prenoms: form.prenoms.trim(),
      sexe: form.sexe,
      classe: (form.classe as any) || "",
      telephone: form.telephone.trim(),
      matricule: form.matricule.trim() || undefined,
      identifiantAnpe: form.identifiantAnpe.trim() || undefined,
      naissance: form.naissance,
      lieuNaissance: form.lieuNaissance.trim(),
      nationalite: form.nationalite.trim(),
      email: form.email.trim(),
      ifu: cleanIfu,
      npi: form.npi.trim() || undefined,
      premierePriseService: form.premierePriseService,
      statut: assignedStatus as any,
      affectation: form.affectation.trim() || undefined,
    };

    const nextList = editId === null 
      ? [...teachers, payload] 
      : teachers.map((t) => (t.id === editId ? payload : t));

    try {
      await saveTeachers(nextList);
      setTeachers(nextList);
      toast.success(editId === null ? "Enseignant enrôlé avec succès !" : "Profil mis à jour !");
      setForm(emptyForm);
      setEditId(null);
      if (sector === "prive") setPriveTab("liste");
    } catch (err) {
      toast.error(storageErrorMessage(err));
    }
  }

  function startEdit(t: Teacher) {
    setForm({
      matricule: t.matricule ?? "",
      identifiantAnpe: t.identifiantAnpe ?? "",
      nom: t.nom,
      prenoms: t.prenoms,
      sexe: t.sexe ?? "",
      naissance: t.naissance ?? "",
      lieuNaissance: t.lieuNaissance ?? "",
      nationalite: t.nationalite ?? "Béninoise",
      telephone: t.telephone,
      email: t.email ?? "",
      ifu: t.ifu ?? "",
      npi: t.npi ?? "",
      premierePriseService: t.premierePriseService ?? "",
      statut: t.statut ?? "",
      classe: t.classe ?? "",
      affectation: t.affectation ?? "",
    });
    setEditId(t.id);
    if (sector === "prive") setPriveTab("formulaire");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number) {
    const next = teachers.filter((t) => t.id !== id);
    try {
      await saveTeachers(next);
      setTeachers(next);
      toast.success("Enseignant supprimé.");
      setDeleteConfirmId(null);
      if (selectedTeacher?.id === id) setSelectedTeacher(null);
    } catch (err) {
      toast.error(storageErrorMessage(err));
    }
  }

  async function exportExcel() {
    try {
      const title = sector === "public" ? "Enseignants_Public" : "Enseignants_Prive";
      const headers = [
        "N°", "Matricule", "Identifiant ANPE", "Nom", "Prénoms", "Sexe", 
        "Date Naiss.", "Lieu Naiss.", "Nationalité", "Téléphone", "E-mail", 
        "IFU", "NPI", "1ère Prise Service", "Statut", "Classe", "Affectation"
      ];
      const rows = activeList.map((t, idx) => [
        idx + 1,
        t.matricule ?? "",
        t.identifiantAnpe ?? "",
        t.nom,
        t.prenoms,
        t.sexe ?? "",
        t.naissance ?? "",
        t.lieuNaissance ?? "",
        t.nationalite ?? "",
        t.telephone,
        t.email ?? "",
        t.ifu ?? "",
        t.npi ?? "",
        t.premierePriseService ?? "",
        t.statut ?? "",
        t.classe ?? "",
        t.affectation ?? "",
      ]);
      const blob = await exportTable(title, headers, rows);
      downloadBlob(blob, `${title}_MasterNotePro.xlsx`);
      toast.success("Export Excel terminé.");
    } catch {
      toast.error("Erreur lors de l'export Excel.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 text-slate-800 dark:text-slate-100">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation retour */}
        <div className="flex items-center justify-between">
          <Link to="/masternote" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Retour à MasterNote
          </Link>
          <span className="text-xs uppercase tracking-wider font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full">
            Module Enseignants
          </span>
        </div>

        {/* En-tête & Sélecteur de secteur */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            Enrôlement & Gestion des Enseignants
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Gestion distincte du personnel enseignant selon les normes de l'enseignement au Bénin.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setSector("public"); setEditId(null); setForm(emptyForm); setError(""); }}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 font-bold transition-all ${
                sector === "public"
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 hover:border-slate-300"
              }`}
            >
              <School className="w-5 h-5 text-emerald-600" />
              <span>Secteur Public (ACDPE / FE / AME)</span>
            </button>

            <button
              type="button"
              onClick={() => { setSector("prive"); setEditId(null); setForm(emptyForm); setError(""); }}
              className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 font-bold transition-all ${
                sector === "prive"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 hover:border-slate-300"
              }`}
            >
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>Secteur Privé</span>
            </button>
          </div>
        </div>

        {/* Section Privé : Onglets Formulaire / Liste */}
        {sector === "prive" && (
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex gap-2">
              <Button
                variant={priveTab === "formulaire" ? "default" : "outline"}
                onClick={() => setPriveTab("formulaire")}
                className="rounded-xl"
              >
                <UserPlus className="w-4 h-4 mr-2" /> FORMULAIRE
              </Button>
              <Button
                variant={priveTab === "liste" ? "default" : "outline"}
                onClick={() => setPriveTab("liste")}
                className="rounded-xl"
              >
                LISTE ({priveTeachers.length})
              </Button>
            </div>
            {priveTab === "liste" && (
              <Button variant="outline" onClick={exportExcel} className="rounded-xl gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                EXPORTER EXCEL ({priveTeachers.length})
              </Button>
            )}
          </div>
        )}

        {/* Formulaire (Visible en Public ou sur l'onglet Formulaire en Privé) */}
        {(sector === "public" || (sector === "prive" && priveTab === "formulaire")) && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                {editId ? "Modifier l'enseignant" : sector === "public" ? "Nouvel enseignant du secteur public" : "Nouvel enseignant du secteur privé"}
              </h2>
              {isFormDirty && (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetForm} className="text-rose-600 hover:text-rose-700">
                  <RotateCcw className="w-4 h-4 mr-1" /> Vider le formulaire
                </Button>
              )}
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-sm rounded-xl border border-rose-200 dark:border-rose-800">
                {error}
              </div>
            )}

            {/* Choix statut public obligatoire */}
            {sector === "public" && (
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                  Statut dans l'enseignement public <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(["ACDPE", "FE", "AME"] as const).map((st) => (
                    <label
                      key={st}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer font-semibold text-sm transition-all ${
                        form.statut === st
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="statutPublic"
                        value={st}
                        checked={form.statut === st}
                        onChange={() => setForm({ ...form, statut: st })}
                        className="sr-only"
                      />
                      <span>{st}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Grille des champs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sector === "public" && (
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Matricule <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.matricule}
                    onChange={(e) => setForm({ ...form, matricule: e.target.value })}
                    placeholder="Ex: 123456"
                    className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Identifiant ANPE</label>
                <input
                  type="text"
                  value={form.identifiantAnpe}
                  onChange={(e) => setForm({ ...form, identifiantAnpe: e.target.value })}
                  placeholder="Peut être complété plus tard"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Nom <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value.toUpperCase() })}
                  placeholder="NOM EN MAJUSCULES"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Prénoms <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.prenoms}
                  onChange={(e) => setForm({ ...form, prenoms: e.target.value })}
                  placeholder="Prénoms"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Sexe <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={form.sexe}
                  onChange={(e) => setForm({ ...form, sexe: e.target.value as any })}
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">Sélectionner</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Date de naissance <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.naissance}
                  onChange={(e) => setForm({ ...form, naissance: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Lieu de naissance <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.lieuNaissance}
                  onChange={(e) => setForm({ ...form, lieuNaissance: e.target.value })}
                  placeholder="Ex: Cotonou"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Nationalité <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.nationalite}
                  onChange={(e) => setForm({ ...form, nationalite: e.target.value })}
                  placeholder="Béninoise"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Téléphone <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="+229 01..."
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Adresse e-mail <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="nom@exemple.com"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Numéro IFU (13 chiffres) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={13}
                  value={form.ifu}
                  onChange={(e) => setForm({ ...form, ifu: e.target.value.replace(/\D/g, "") })}
                  placeholder="13 chiffres obligatoires"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono tracking-wider"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Numéro NPI</label>
                <input
                  type="text"
                  value={form.npi}
                  onChange={(e) => setForm({ ...form, npi: e.target.value })}
                  placeholder="Numéro personnel d'identification"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Première prise de service <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.premierePriseService}
                  onChange={(e) => setForm({ ...form, premierePriseService: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Classe tenue</label>
                <select
                  value={form.classe}
                  onChange={(e) => setForm({ ...form, classe: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">Aucune / Non définie</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400">Affectation / École</label>
                <input
                  type="text"
                  value={form.affectation}
                  onChange={(e) => setForm({ ...form, affectation: e.target.value })}
                  placeholder="Ex: EPP Agla Groupe B"
                  className="w-full mt-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              {editId && (
                <Button type="button" variant="outline" onClick={() => { setEditId(null); setForm(emptyForm); }}>
                  Annuler la modification
                </Button>
              )}
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-6">
                {editId ? "Enregistrer les modifications" : "Enrôler l'enseignant"}
              </Button>
            </div>
          </form>
        )}

        {/* Liste des Enseignants (Visible pour Public ou pour Privé onglet Liste) */}
        {(sector === "public" || (sector === "prive" && priveTab === "liste")) && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold">
                {sector === "public" ? "Liste des enseignants du public" : "Liste des enseignants du privé"} ({filteredTeachers.length})
              </h2>
              {sector === "public" && (
                <Button variant="outline" size="sm" onClick={exportExcel} className="gap-2 rounded-xl">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Exporter Excel ({publicTeachers.length})
                </Button>
              )}
            </div>

            {/* Barre de recherche et filtre */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom, matricule, IFU..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              {sector === "public" && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="">Tous les statuts</option>
                  <option value="ACDPE">ACDPE</option>
                  <option value="FE">FE</option>
                  <option value="AME">AME</option>
                </select>
              )}
            </div>

            {/* Tableau / Liste */}
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Aucun enseignant enregistré dans cette catégorie.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Nom & Prénoms</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Matricule / ANPE</th>
                      <th className="p-3">Téléphone & E-mail</th>
                      <th className="p-3">IFU (13 ch.)</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTeachers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          {t.nom} {t.prenoms}
                          {t.classe && <span className="ml-2 text-xs font-normal text-slate-500">({t.classe})</span>}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {t.statut || "Privé"}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {t.matricule || t.identifiantAnpe || "—"}
                        </td>
                        <td className="p-3 text-xs">
                          <div>{t.telephone}</div>
                          <div className="text-slate-400">{t.email}</div>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {t.ifu ? `${t.ifu.slice(0, 4)}...${t.ifu.slice(-4)}` : "—"}
                        </td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedTeacher(t)} title="Consulter">
                            <Eye className="w-4 h-4 text-slate-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(t)} title="Modifier">
                            <Pencil className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(t.id)} title="Supprimer">
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal Consultation Fiche */}
        {selectedTeacher && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-lg font-bold">Dossier de l'Enseignant</h3>
                <button onClick={() => setSelectedTeacher(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div><span className="text-slate-400">Nom & Prénoms :</span> <p className="font-bold">{selectedTeacher.nom} {selectedTeacher.prenoms}</p></div>
                <div><span className="text-slate-400">Statut :</span> <p className="font-bold">{selectedTeacher.statut || "Privé"}</p></div>
                <div><span className="text-slate-400">Sexe :</span> <p>{selectedTeacher.sexe === "M" ? "Masculin" : "Féminin"}</p></div>
                <div><span className="text-slate-400">Naissance :</span> <p>{selectedTeacher.naissance} à {selectedTeacher.lieuNaissance}</p></div>
                <div><span className="text-slate-400">Nationalité :</span> <p>{selectedTeacher.nationalite}</p></div>
                <div><span className="text-slate-400">Téléphone :</span> <p>{selectedTeacher.telephone}</p></div>
                <div><span className="text-slate-400">E-mail :</span> <p>{selectedTeacher.email}</p></div>
                <div><span className="text-slate-400">IFU :</span> <p className="font-mono">{selectedTeacher.ifu}</p></div>
                <div><span className="text-slate-400">NPI :</span> <p className="font-mono">{selectedTeacher.npi || "—"}</p></div>
                <div><span className="text-slate-400">Matricule :</span> <p className="font-mono">{selectedTeacher.matricule || "—"}</p></div>
                <div><span className="text-slate-400">Identifiant ANPE :</span> <p className="font-mono">{selectedTeacher.identifiantAnpe || "—"}</p></div>
                <div><span className="text-slate-400">1ère Prise de service :</span> <p>{selectedTeacher.premierePriseService}</p></div>
                <div><span className="text-slate-400">Classe tenue :</span> <p className="font-bold">{selectedTeacher.classe || "Non définie"}</p></div>
                <div><span className="text-slate-400">Affectation :</span> <p>{selectedTeacher.affectation || "—"}</p></div>
              </div>
              <div className="flex justify-end pt-3 border-t">
                <Button onClick={() => setSelectedTeacher(null)} className="rounded-xl">Fermer</Button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation de suppression */}
        {deleteConfirmId && (
          <Confirm
            open={deleteConfirmId !== null}
            title="Supprimer cet enseignant ?"
            description="Cette action retirera définitivement cet enseignant de la base locale de MasterNote."
            confirmLabel="Supprimer"
            variant="destructive"
            onConfirm={() => handleDelete(deleteConfirmId)}
            onCancel={() => setDeleteConfirmId(null)}
          />
        )}

        {/* Confirmation de vidage de formulaire */}
        {showResetConfirm && (
          <Confirm
            open={showResetConfirm}
            title="Vider le formulaire ?"
            description="Des informations ont été saisies dans le formulaire. Voulez-vous vraiment tout effacer ?"
            confirmLabel="Oui, effacer"
            variant="destructive"
            onConfirm={confirmReset}
            onCancel={() => setShowResetConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
