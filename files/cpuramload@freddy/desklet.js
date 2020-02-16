const Desklet = imports.ui.desklet;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const Cinnamon = imports.gi.Cinnamon;

const uuid = "temperature@freddy";

Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
  return Gettext.dgettext(uuid, str);
}

function TheDesklet(metadata, desklet_id) {
  this._init(metadata, desklet_id);
}

TheDesklet.prototype = {
  __proto__: Desklet.Desklet.prototype,

  _init: function(metadata, desklet_id) {
    Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

    this.settings = new Settings.DeskletSettings(
      this,
      this.metadata.uuid,
      desklet_id
    );
    this.settings.bindProperty(
      Settings.BindingDirection.IN,
      "height",
      "height",
      this.on_setting_changed,
      null
    );
    this.settings.bindProperty(
      Settings.BindingDirection.IN,
      "width",
      "width",
      this.on_setting_changed,
      null
    );
    this.settings.bindProperty(
      Settings.BindingDirection.IN,
      "refresh-rate",
      "refresh_rate",
      this.on_setting_changed,
      null
    );

    this.active = [];
    this.total = [];
    this.refresh_rate = 1;
    this.metadata["prevent-decorations"] = true;
    this._updateDecoration();
    this.setup_ui();
  },

  on_setting_changed() {
    this.metadata["prevent-decorations"] = true;
    this._updateDecoration();
    this.window.set_size(this.width, this.height);
  },

  on_desklet_removed: function() {
    this.window.destroy_all_children();
    this.window.destroy();
    Mainloop.source_remove(this.mainloop);
  },

  setup_ui: function() {
    this.window = new St.BoxLayout({
      vertical: true,
      width: this.width,
      height: this.height,
      style_class: "box"
    });

    let ramPercent = this.get_ram_usage();
    let cpuPercent = this.get_cpu_usage();

    this.text1 = new St.Label({ style_class: "text-label"});
    this.text1.set_text("CPU: " + cpuPercent);
    this.window.add(this.text1);

    this.text1 = new St.Label({ style_class: "text-label"});
    this.text1.set_text("RAM: " + ramPercent);
    this.window.add(this.text1);

    this.setContent(this.window);
    this.mainloop = Mainloop.timeout_add(
      this.refresh_rate * 1000,
      Lang.bind(this, this.setup_ui)
    );
  },

  get_ram_usage: function() {
    try {
      // borrowed from: diskspace@schorschii
      let subprocess = new Gio.Subprocess({
        argv: ['/usr/bin/free'],
        flags: Gio.SubprocessFlags.STDOUT_PIPE,
      });
      subprocess.init(null);
      let [, out] = subprocess.communicate_utf8(null, null); // get full output from stdout
      let fsline = out.split(/\r?\n/)[1]; // get second line with fs information
      let fsvalues = fsline.split(/\s+/); // separate space-separated values from line
      // https://stackoverflow.com/questions/30772369/linux-free-m-total-used-and-free-memory-values-dont-add-up
      let avail = parseInt(fsvalues[3]) + parseInt(fsvalues[5]);
      let use = parseInt(fsvalues[2]);
      let size = use + avail;

      let percentage = Math.round(use * 100 / size);
      if (percentage < 10) {
        return " " + percentage + "%";
      } else {
        return percentage + "%";
      }

    } catch (error) {
      return error + "";
    }
  },

  get_cpu_usage: function() {
    try {
      // borrowed from: cpuload@kimse
      let utilization = [];
      let active = [];
      let total = [];
      let hasPreviousSample = this.active.length && this.total.length;

      let activity = Cinnamon.get_file_contents_utf8_sync("/proc/stat").match(/^cpu\ +.+$/mg);

      activity.forEach(function(cpu, index) {

          // Remove double space for total stats (starts with "cpu  ")
          let usage = cpu.replace("  ", " ").split(" ");

          active[index] = parseInt(usage[1]) + parseInt(usage[2]) + parseInt(usage[3]) + parseInt(usage[7]) + parseInt(usage[8]);
          total[index] = parseInt(usage[1]) + parseInt(usage[2]) + parseInt(usage[3]) + parseInt(usage[4]) + parseInt(usage[5]) + parseInt(usage[7]) + parseInt(usage[8]);

          if(hasPreviousSample) {
              utilization[index] = this.calculateCpuUtilization(active[index], this.active[index], total[index], this.total[index]);
          }
          else {
              utilization[index] = 0;
          }

      }, this);

      this.active = active;
      this.total = total;

      if (utilization < 10) {
        return " " + utilization + "%";
      } else {
        return utilization + "%";
      }

    } catch (error) {
      return error + "";
    }
  },

  calculateCpuUtilization: function(currentActive, previousActive, currentTotal, previousTotal) {
    return Math.round((100 * (currentActive - previousActive) / (currentTotal - previousTotal)));
  }
};

function main(metadata, desklet_id) {
  return new TheDesklet(metadata, desklet_id);
}
