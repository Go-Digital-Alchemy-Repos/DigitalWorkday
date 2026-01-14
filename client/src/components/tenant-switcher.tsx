import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useAppMode } from "@/hooks/useAppMode";
import { useLocation } from "wouter";
import { Building2, ChevronDown, Play, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TenantPickerItem {
  id: string;
  name: string;
  status: string;
}

export function TenantSwitcher() {
  const { isImpersonating, effectiveTenantName, startImpersonation, stopImpersonation } = useAppMode();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [open, setOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantPickerItem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const { data: tenants, isLoading } = useQuery<TenantPickerItem[]>({
    queryKey: ["/api/v1/super/tenants/picker"],
    enabled: !isImpersonating,
  });

  const handleSelectTenant = (tenant: TenantPickerItem) => {
    setSelectedTenant(tenant);
    setOpen(false);
  };

  const handleActAsTenant = () => {
    if (selectedTenant?.status === "suspended") {
      toast({
        title: "Cannot act as suspended tenant",
        description: "This tenant is currently suspended.",
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmImpersonation = async () => {
    if (!selectedTenant) return;
    
    setIsStarting(true);
    try {
      await apiRequest("POST", "/api/v1/super/impersonate/start", {
        tenantId: selectedTenant.id,
      });
      
      startImpersonation(selectedTenant.id, selectedTenant.name);
      setConfirmOpen(false);
      setSelectedTenant(null);
      
      toast({
        title: "Acting as tenant",
        description: `You are now acting as ${selectedTenant.name}`,
      });
      
      setLocation("/");
    } catch (error) {
      toast({
        title: "Failed to start impersonation",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleExitImpersonation = async () => {
    try {
      await apiRequest("POST", "/api/v1/super/impersonate/stop", {});
      stopImpersonation();
      setLocation("/super-admin");
      toast({
        title: "Exited tenant mode",
        description: "You are back in Super Admin mode",
      });
    } catch (error) {
      stopImpersonation();
      setLocation("/super-admin");
    }
  };

  if (isImpersonating) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-md border border-amber-300 dark:border-amber-700">
          <Building2 className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {effectiveTenantName}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExitImpersonation}
          className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
          data-testid="button-exit-tenant-mode"
        >
          <X className="h-4 w-4 mr-1" />
          Exit
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-[200px] justify-between"
              data-testid="button-tenant-picker"
            >
              {selectedTenant ? (
                <span className="truncate">{selectedTenant.name}</span>
              ) : (
                <span className="text-muted-foreground">Select tenant...</span>
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tenants..." data-testid="input-tenant-search" />
              <CommandList>
                <CommandEmpty>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    "No tenants found."
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {tenants?.map((tenant) => (
                    <CommandItem
                      key={tenant.id}
                      value={tenant.name}
                      onSelect={() => handleSelectTenant(tenant)}
                      className="flex items-center justify-between"
                      data-testid={`tenant-option-${tenant.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{tenant.name}</span>
                      </div>
                      <Badge 
                        variant={tenant.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {tenant.status}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          onClick={handleActAsTenant}
          disabled={!selectedTenant || selectedTenant.status === "suspended"}
          className="gap-1"
          data-testid="button-act-as-tenant"
        >
          <Play className="h-4 w-4" />
          Act as Tenant
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Act as Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to act as <strong>{selectedTenant?.name}</strong>. 
              Any changes you make will affect their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-impersonation">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmImpersonation}
              disabled={isStarting}
              data-testid="button-confirm-impersonation"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
