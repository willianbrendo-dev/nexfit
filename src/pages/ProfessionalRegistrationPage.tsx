import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, User, Camera, Loader2 } from "lucide-react";
import { SPECIALTY_CATEGORIES } from "@/lib/professionalSpecialties";

export default function ProfessionalRegistrationPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    const [profileImage, setProfileImage] = useState<File | null>(null);
    const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
    const [coverImage, setCoverImage] = useState<File | null>(null);
    const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        crm_crp: "",
        specialty: "",
        base_price: "",
        bio: "",
        phone: "",
        email: user?.email || "",
        instagram: "",
    });

    const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProfileImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setProfileImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setCoverImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const uploadImage = async (file: File, path: string): Promise<string | null> => {
        try {
            const fileExt = file.name.split(".").pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${path}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from("professional-images")
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from("professional-images")
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error: any) {
            console.error("Upload error:", error);
            return null;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);
        try {
            // Upload images
            let profileImageUrl: string | null = null;
            let coverImageUrl: string | null = null;

            if (profileImage) {
                profileImageUrl = await uploadImage(profileImage, "profiles");
            }

            if (coverImage) {
                coverImageUrl = await uploadImage(coverImage, "covers");
            }

            // Create professional profile
            const { error: insertError } = await supabase.from("professionals").insert({
                user_id: user.id,
                name: formData.name,
                crm_crp: formData.crm_crp || null,
                specialty: formData.specialty,
                base_price: formData.base_price ? parseFloat(formData.base_price) : null,
                bio: formData.bio || null,
                phone: formData.phone || null,
                email: formData.email,
                instagram: formData.instagram || null,
                profile_image_url: profileImageUrl,
                cover_image_url: coverImageUrl,
            });

            if (insertError) throw insertError;

            // Add professional role to user_roles
            const { error: roleError } = await supabase.from("user_roles").insert({
                user_id: user.id,
                role: "professional",
            });

            if (roleError && !roleError.message.includes("duplicate")) {
                console.error("Role error:", roleError);
            }

            toast({
                title: "Cadastro concluído!",
                description: "Seu perfil profissional foi criado com sucesso.",
            });

            navigate("/professional/onboarding");
        } catch (error: any) {
            console.error("Registration error:", error);
            toast({
                title: "Erro no cadastro",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black pb-20">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-white/10 bg-black/80 backdrop-blur-xl">
                <div className="container mx-auto flex items-center justify-between px-4 py-4">
                    <h1 className="text-xl font-black uppercase tracking-tight text-white">
                        Cadastro Profissional
                    </h1>
                    <Button variant="ghost" onClick={() => navigate(-1)}>
                        Cancelar
                    </Button>
                </div>
            </div>

            <div className="container mx-auto max-w-2xl px-4 py-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Cover Image */}
                    <Card className="border-white/10 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Imagem de Capa</CardTitle>
                            <CardDescription>Adicione uma imagem de fundo para seu perfil</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="relative h-40 overflow-hidden rounded-xl border-2 border-dashed border-white/20 bg-white/5">
                                {coverImagePreview ? (
                                    <img src={coverImagePreview} alt="Cover" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <Camera className="h-12 w-12 text-white/40" />
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCoverImageChange}
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Profile Image */}
                    <Card className="border-white/10 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Foto de Perfil</CardTitle>
                            <CardDescription>Adicione sua foto profissional</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-center">
                                <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white/20 bg-white/5">
                                    {profileImagePreview ? (
                                        <img src={profileImagePreview} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <User className="h-16 w-16 text-white/40" />
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleProfileImageChange}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Basic Info */}
                    <Card className="border-white/10 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Informações Básicas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="name" className="text-white">Nome Completo *</Label>
                                <Input
                                    id="name"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="bg-white/10 text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="crm_crp" className="text-white">CRM/CRP/Registro</Label>
                                    <Input
                                        id="crm_crp"
                                        value={formData.crm_crp}
                                        onChange={(e) => setFormData({ ...formData, crm_crp: e.target.value })}
                                        className="bg-white/10 text-white"
                                        placeholder="Ex: CRM 12345"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="base_price" className="text-white">Preço Base (R$)</Label>
                                    <Input
                                        id="base_price"
                                        type="number"
                                        step="0.01"
                                        value={formData.base_price}
                                        onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                                        className="bg-white/10 text-white"
                                        placeholder="150.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="specialty" className="text-white">Especialidade *</Label>
                                <Select
                                    required
                                    value={formData.specialty}
                                    onValueChange={(value) => setFormData({ ...formData, specialty: value })}
                                >
                                    <SelectTrigger className="bg-white/10 text-white">
                                        <SelectValue placeholder="Selecione sua especialidade" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(SPECIALTY_CATEGORIES).map(([key, category]) => (
                                            <div key={key}>
                                                <div className="px-2 py-1.5 text-xs font-bold uppercase text-muted-foreground">
                                                    {category.label}
                                                </div>
                                                {category.specialties.map((spec) => (
                                                    <SelectItem key={spec.value} value={spec.value}>
                                                        {spec.label}
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label htmlFor="bio" className="text-white">Biografia</Label>
                                <Textarea
                                    id="bio"
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    className="bg-white/10 text-white"
                                    placeholder="Conte um pouco sobre sua experiência e formação..."
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Contact Info */}
                    <Card className="border-white/10 bg-white/5">
                        <CardHeader>
                            <CardTitle className="text-white">Contato</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="email" className="text-white">Email *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="bg-white/10 text-white"
                                />
                            </div>

                            <div>
                                <Label htmlFor="phone" className="text-white">Telefone/WhatsApp</Label>
                                <MaskedInput
                                    id="phone"
                                    mask="phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="bg-white/10 text-white"
                                    placeholder="(11) 99999-9999"
                                />
                            </div>

                            <div>
                                <Label htmlFor="instagram" className="text-white">Instagram</Label>
                                <Input
                                    id="instagram"
                                    value={formData.instagram}
                                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                                    className="bg-white/10 text-white"
                                    placeholder="@seuperfil"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-black hover:bg-primary/90"
                        size="lg"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Criando perfil...
                            </>
                        ) : (
                            "Criar Perfil Profissional"
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}
